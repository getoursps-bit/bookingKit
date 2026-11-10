import type { NextRequest } from "next/server";
import { adminRequest, backTo } from "@/core/platform/staff/http";
import { requireStaffPage } from "@/core/platform/staff/session";
import { defineViews } from "@/extension/views";
import { getI18n } from "@/i18n/server";
import { ActionForm, AdminNotice, Panel } from "@/views/parts/admin/parts";
import { Alert } from "@/views/parts/booking/parts";
import { BookButton } from "@/views/parts/site/landing";
import { Phone, Time } from "@/views/parts/site/values";
import { Icon } from "@/views/parts/ui/Icon";
import { approve, outcomeOf, pendingRequests, refuse, type Request } from "./server/requests";

// What approval shows: the requests on the owner's today page and on a
// screen of their own, each with approve and refuse; the switch in her
// settings; and, on the customer's private link, why a request ended.

type Say = (key: string, vars?: Record<string, string | number>) => string;
const PAGE = "/admin/x/requests";
const ACTIONS = "/api/ext/approval";

/** The page's translator, for the extension's own keys. */
async function i18n() {
  const { t, locale } = await getI18n();
  return { t: t as unknown as Say, locale };
}

/** One request with "approve" and "refuse" (with an optional reason for the customer). */
async function RequestCard({ booking, csrf, back }: { booking: Request; csrf: string; back: string }) {
  const { t } = await i18n();
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">
          <Time value={booking.start} pattern="EEEE dd/MM HH:mm" />
        </span>
        <span className="text-sm text-ink-muted">
          {t("requests.requestedAt")} <Time value={booking.createdAt} pattern="dd/MM HH:mm" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={`/admin/customers/${booking.customerId}`} className="font-semibold">
          {booking.customerName}
        </a>
        {booking.visits === 0 ? <span className="chip">{t("requests.firstVisit")}</span> : null}
        {booking.phone ? (
          <a href={`tel:${booking.phone}`} className="text-sm">
            <Phone e164={booking.phone} />
          </a>
        ) : null}
      </div>
      <p className="text-sm text-ink-soft">
        {booking.lines.map((line) => [line.label, line.serviceName].filter(Boolean).join(" – ")).join(", ")}
      </p>
      {booking.notes ? (
        <p className="rounded-xl bg-surface p-3 text-sm">
          <span className="font-semibold">{t("requests.note")}: </span>
          {booking.notes}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:items-end">
        <ActionForm action={`${ACTIONS}/approve`} csrf={csrf} name="approve" hidden={{ id: booking.id, back }}>
          <button type="submit" className="btn btn-primary min-h-11">
            <Icon name="check" size={18} />
            {t("requests.approve")}
          </button>
        </ActionForm>
        <ActionForm
          action={`${ACTIONS}/refuse`}
          csrf={csrf}
          name="refuse"
          hidden={{ id: booking.id, back }}
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label className="field flex-1">
            <span className="field-label text-sm">{t("requests.refuseReason")}</span>
            <input name="reason" className="input min-h-11" maxLength={300} />
          </label>
          <button type="submit" className="btn btn-secondary min-h-11">
            <Icon name="close" size={18} />
            {t("requests.refuse")}
          </button>
        </ActionForm>
      </div>
    </li>
  );
}

async function Requests({ csrf, back, limit }: { csrf: string; back: string; limit?: number }) {
  const { t, locale } = await i18n();
  const requests = await pendingRequests({ locale, limit });
  if (requests.length === 0) return <p className="text-ink-muted">{t("requests.none")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {requests.map((booking) => (
        <RequestCard key={booking.id} booking={booking} csrf={csrf} back={back} />
      ))}
    </ul>
  );
}

/** First on the today page: each request keeps a time until she answers. */
async function TodayRequests({ csrf }: { csrf: string }) {
  const { t } = await i18n();
  return (
    <Panel
      id="requests"
      title={t("requests.title")}
      action={
        <a href={PAGE} className="text-sm underline">
          {t("requests.all")}
        </a>
      }
    >
      <Requests csrf={csrf} back="/admin" limit={10} />
    </Panel>
  );
}

async function RequestsPage({ search }: { search: Record<string, string | undefined> }) {
  const { csrf } = await requireStaffPage();
  const { t } = await i18n();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.requests")}</h1>
      {search.ok?.startsWith("requests.") ? <Alert kind="ok">{t(search.ok)}</Alert> : <AdminNotice ok={search.ok} error={search.error} />}
      <Panel id="requests" title={t("requests.title")}>
        <p className="mb-4 text-sm text-ink-muted">{t("requests.intro")}</p>
        <Requests csrf={csrf} back={PAGE} />
      </Panel>
    </div>
  );
}

/** Under the booking on the private link: why the request ended, and a way to book again. */
async function Ended({ appointmentId }: { appointmentId: number }) {
  const outcome = await outcomeOf(appointmentId);
  if (!outcome) return null;
  const { t } = await i18n();
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      <Alert kind="info">
        {outcome.outcome === "refused"
          ? t("manage.refusedText", { reason: outcome.reason ?? t("requests.noReason") })
          : t("manage.expiredText")}
      </Alert>
      <BookButton>{t("manage.bookAgain")}</BookButton>
    </div>
  );
}

/** Approve or refuse, posted from the today page or the requests screen, and back to where it came from. */
async function decide(request: NextRequest, action: "approve" | "refuse") {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, staff } = req;
  const back = form.back === "/admin" ? "/admin" : PAGE;
  const id = Number(form.id);
  if (!Number.isInteger(id)) return backTo(request, back, { error: "invalid" });
  const result = action === "approve" ? await approve(id, staff.id) : await refuse(id, form.reason ?? null, staff.id);
  if (!result.ok) return backTo(request, back, { error: result.reason }, 409);
  return backTo(request, back, { ok: action === "approve" ? "requests.approved" : "requests.refused" });
}

export default defineViews({
  id: "approval",
  settings: { features: ["booking.approval"] },
  today: ({ csrf }) => <TodayRequests csrf={csrf} />,
  adminPages: {
    requests: { label: "admin.nav.requests", icon: "check", pending: true, default: ({ search }) => <RequestsPage search={search} /> },
  },
  manage: ({ appointment }) => (appointment.status === "cancelled" ? <Ended appointmentId={appointment.id} /> : null),
  actions: {
    approve: (request) => decide(request, "approve"),
    refuse: (request) => decide(request, "refuse"),
  },
});
