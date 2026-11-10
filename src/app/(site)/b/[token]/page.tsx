import { Fragment } from "react";
import { cookies } from "next/headers";
import { brand } from "@/brand";
import { extensionViews } from "@/extension/views";
import { Alert, errorText } from "@/components/booking/parts";
import { SubmitButton } from "@/components/booking/SubmitButton";
import { TimePicker } from "@/components/booking/TimePicker";
import { BookButton } from "@/components/site/landing";
import { PageHeader } from "@/components/site/PageHeader";
import { Phone, Price, Time } from "@/components/site/values";
import { Icon } from "@/components/ui/Icon";
import { getI18n } from "@/i18n/server";
import { isolate } from "@/i18n/t";
import type { MessageKey } from "@/i18n/t";
import { bookingView } from "@/core/booking/flow";
import { getWeekForMove } from "@/core/booking/service";
import { getSettings } from "@/core/platform/settings";
import { CSRF_COOKIE } from "@/core/platform/security";
import { pageMetadata } from "@/core/website/seo";
import { getSiteData } from "@/core/website/site";
import { localDateOf } from "@/core/platform/time";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const [{ profile }, { t }] = await Promise.all([getSiteData(), getI18n()]);
  // A private page: never indexed, and its address is not put in the metadata.
  return pageMetadata(profile, { title: t("manage.title"), path: "/book" }, true);
}

type Search = { new?: string; done?: string; error?: string; move?: string; date?: string };

const DONE: Record<string, MessageKey> = {
  moved: "manage.moved",
  messagesOff: "manage.messagesOff",
  messagesOn: "manage.messagesOn",
};

/**
 * The customer's private link: the booking, moving and cancelling it before
 * the cutoff, the salon's number after it, and appointment messages on or off.
 */
export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const search = await searchParams;
  const { profile } = await getSiteData();
  const { t, lp, locale } = await getI18n();
  const view = await bookingView(token, { locale });

  if (!view) {
    return (
      <>
        <PageHeader icon="calendar" title={t("manage.gone")} intro={t("manage.goneText")} />
        <BookButton>{t("manage.bookAgain")}</BookButton>
      </>
    );
  }

  const csrf = (await cookies()).get(CSRF_COOKIE)?.value ?? "";
  const settings = await getSettings();
  const { appointment } = view;
  const total = view.lines.reduce((sum, line) => sum + line.priceFromAgorot, 0);
  const error = errorText(t, search.error);
  // The notice after an action: one of the core's, or one an extension's view names.
  const notices: Record<string, string> = Object.assign({}, ...extensionViews().map((views) => views.manageNotices ?? {}), DONE);
  const doneKey = search.done && Object.hasOwn(notices, search.done) ? notices[search.done] : undefined;
  const done = doneKey ? (t as (key: string) => string)(doneKey) : null;
  const tokenField = <input type="hidden" name="token" value={token} />;
  const callButton = profile.phoneE164 ? (
    <a href={`tel:${profile.phoneE164}`} className="btn btn-primary w-fit">
      <Icon name="phone" />
      {t("contact.call")}: <Phone e164={profile.phoneE164} />
    </a>
  ) : null;

  let picker = null;
  if (view.canChange && search.move) {
    const today = localDateOf(new Date());
    const date =
      search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) && search.date >= today
        ? search.date
        : localDateOf(appointment.start) >= today
          ? localDateOf(appointment.start)
          : today;
    const week = await getWeekForMove(token, date);
    if (week.ok) {
      picker = (
        <section aria-labelledby="move-title" className="mt-8">
          <h2 id="move-title" className="mb-4 text-xl font-bold">
            {t("manage.moveTitle")}
          </h2>
          <TimePicker
            initial={{
              date,
              lengthMin: week.week.lengthMin,
              days: week.week.days,
              slots: week.week.slots.map((slot) => slot.toISOString()),
              firstAvailable: week.week.firstAvailable
                ? { date: week.week.firstAvailable.date, start: week.week.firstAvailable.start.toISOString() }
                : null,
            }}
            csrf={csrf}
            action="/api/booking/manage"
            hidden={{ action: "move", token }}
            basePath={lp(`/b/${encodeURIComponent(token)}?move=1&`)}
            apiQuery={`&token=${encodeURIComponent(token)}`}
            submitLabel={t("manage.moveSubmit")}
          />
        </section>
      );
    }
  }

  return (
    <>
      <PageHeader icon="calendar" title={t("manage.title")} />
      <div className="flex flex-col gap-4">
        {search.new ? (
          <Alert kind="ok">
            {view.messagesTo
              ? t(view.messagesTo.channel === "email" ? "manage.confirmedEmail" : "manage.confirmedWhatsapp", {
                  to: isolate(view.messagesTo.to),
                })
              : t("manage.confirmed")}
          </Alert>
        ) : null}
        {done ? <Alert kind="ok">{done}</Alert> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}

        <section aria-labelledby="booking-details" className="card p-5">
          <h2 id="booking-details" className="visually-hidden">
            {t("manage.title")}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-muted">{t("manage.when")}</dt>
              <dd className="text-xl font-extrabold">
                <Time value={appointment.start} pattern="EEEE dd/MM/yyyy HH:mm" />
              </dd>
              <dd className="chip mt-2 w-fit">{t(`manage.status.${appointment.status}` as MessageKey)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">{t("manage.name")}</dt>
              <dd className="font-semibold">{view.customerName}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="mb-2 text-sm text-ink-muted">{t("manage.lines")}</dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {view.lines.map((line, index) => (
                    <li key={index} className="flex items-center gap-3 rounded-2xl bg-paper p-3">
                      <Icon name={brand.mark} className="text-brand" />
                      <span className="flex-1">
                        {line.label ? <span className="font-bold">{line.label} · </span> : null}
                        {line.serviceName}
                      </span>
                      <span className="text-sm text-ink-muted">
                        {t("manage.priceFrom")}
                        <Price agorot={line.priceFromAgorot} />
                      </span>
                    </li>
                  ))}
                </ul>
                {view.lines.length > 1 ? (
                  <p className="mt-2 text-end text-sm font-semibold">
                    <Price agorot={total} />
                  </p>
                ) : null}
              </dd>
            </div>
          </dl>
        </section>

        {appointment.status === "confirmed" ? (
          view.canChange ? (
            <section className="flex flex-wrap gap-3">
              {!search.move ? (
                <a href={lp(`/b/${encodeURIComponent(token)}?move=1`)} className="btn btn-primary">
                  <Icon name="calendar" />
                  {t("manage.move")}
                </a>
              ) : null}
              <details className="card w-full p-0 sm:w-auto">
                <summary className="btn btn-secondary w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <Icon name="close" />
                  {t("manage.cancel")}
                </summary>
                <form method="post" action="/api/booking/manage" className="flex flex-col gap-3 p-4">
                  <input type="hidden" name="csrf" value={csrf} />
                  {tokenField}
                  <input type="hidden" name="action" value="cancel" />
                  <p>{t("manage.cancelAsk")}</p>
                  <SubmitButton className="btn w-fit bg-danger text-white">{t("manage.cancelConfirm")}</SubmitButton>
                </form>
              </details>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <p className="text-ink-muted">{t("manage.cutoff", { hours: settings["booking.cutoffHours"] })}</p>
              {callButton}
            </section>
          )
        ) : null}
      </div>

      {picker}

      {/* What the extensions add under the booking, such as a pet's photo. */}
      {extensionViews().map((views) =>
        views.manage ? <Fragment key={views.id}>{views.manage({ token, csrf, appointment })}</Fragment> : null,
      )}

      {appointment.status === "confirmed" ? (
        <section aria-labelledby="messages-title" className="card mt-8 p-5">
          <h2 id="messages-title" className="mb-3 font-bold">
            {t("manage.messages")}
          </h2>
          <form method="post" action="/api/booking/manage">
            <input type="hidden" name="csrf" value={csrf} />
            {tokenField}
            <input type="hidden" name="action" value={view.messagesOn ? "messagesOff" : "messagesOn"} />
            <button type="submit" className="btn btn-secondary">
              <Icon name="bell" />
              {view.messagesOn ? t("manage.stopMessages") : t("manage.startMessages")}
            </button>
          </form>
        </section>
      ) : null}

      <p className="mt-6 text-sm text-ink-muted">{t("manage.private")}</p>
    </>
  );
}
