import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CodeStep } from "@/components/booking/CodeStep";
import { ContactStep } from "@/components/booking/ContactStep";
import { Alert, errorText, Progress, type Step } from "@/components/booking/parts";
import { ServiceStep } from "@/components/booking/ServiceStep";
import { TimePicker } from "@/components/booking/TimePicker";
import { PageHeader } from "@/components/site/PageHeader";
import { Phone } from "@/components/site/values";
import { Icon } from "@/components/ui/Icon";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { isolate } from "@/i18n/t";
import { decodeDraft, DRAFT_COOKIE } from "@/server/booking/draft";
import { getWeek } from "@/server/booking/service";
import { getConfig } from "@/server/config";
import { getFeatures } from "@/server/features";
import { displayPhone, phoneLink } from "@/server/links";
import { listServices } from "@/server/repos/catalog";
import { getSettings } from "@/server/repos/settings";
import { CSRF_COOKIE, formTimestamp } from "@/server/security";
import { pageMetadata } from "@/server/seo";
import { serviceTags } from "@/server/serviceTags";
import { getSiteData } from "@/server/site";
import { formatLocal, localDateOf } from "@/server/time";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const [{ profile }, { t }] = await Promise.all([getSiteData(), getI18n()]);
  // The booking flow is never a search result.
  return pageMetadata(profile, { title: t("book.title"), path: "/book" }, true);
}

const STEPS: Step[] = ["service", "time", "contact", "code"];

function secondsSince(ms: number | null): number | null {
  return ms === null ? null : Math.floor((Date.now() - ms) / 1000);
}

type Search = { step?: string; date?: string; error?: string; cancelled?: string; sent?: string } & Record<
  string,
  string | undefined
>;

/**
 * The four booking steps as server-rendered pages. Progress lives in a signed
 * cookie, the step in the address, so the back button and a reload both work.
 * When no code channel is set up, online booking is off and the page sends
 * customers to the phone.
 */
/** The time, if it has not passed yet. */
function stillAhead(iso: string | null): string | null {
  return iso && new Date(iso).getTime() > Date.now() ? iso : null;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const { profile } = await getSiteData();
  const { t, lp, locale } = await getI18n();
  const features = getFeatures();
  const callButton = profile.phoneE164 ? (
    <a href={`tel:${profile.phoneE164}`} className="btn btn-primary w-fit">
      <Icon name="phone" />
      {t("contact.call")}: <Phone e164={profile.phoneE164} />
    </a>
  ) : null;

  if (!features.onlineBooking) {
    return (
      <>
        <PageHeader icon="calendar" title={t("book.title")} intro={t("book.byPhone")} />
        {callButton}
      </>
    );
  }

  const jar = await cookies();
  const secret = getConfig().SESSION_SECRET;
  const draft = decodeDraft(secret, jar.get(DRAFT_COOKIE)?.value);
  const csrf = jar.get(CSRF_COOKIE)?.value ?? "";
  const settings = await getSettings();

  let step: Step = STEPS.includes(search.step as Step) ? (search.step as Step) : "service";
  if (step !== "service" && draft.serviceIds.length === 0) step = "service";
  else if ((step === "contact" && !draft.start) || (step === "code" && !draft.holdId)) step = "time";
  if (step !== (search.step ?? "service") && search.step) redirect(lp(`/book?step=${step}`));

  // The chosen services, in order; one no longer offered drops out.
  const [services, tags] = await Promise.all([listServices({ activeOnly: true }), serviceTags(locale)]);
  const chosen = draft.serviceIds.flatMap((id) => services.filter((service) => service.id === id));

  const error = errorText(t, search.error);
  const top = (
    <>
      <PageHeader icon="calendar" title={t("book.title")} intro={step === "service" ? t("book.intro") : undefined} />
      {search.cancelled ? (
        <div className="mb-4">
          <Alert kind="ok">{t("book.cancelled")}</Alert>
        </div>
      ) : null}
      <Progress current={step} />
      {settings["messaging.whatsappOutage"] ? (
        <div className="mb-4">
          <Alert kind="info">{t("book.whatsappOutage")}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert kind="error" id="step-error">
            {error}
          </Alert>
        </div>
      ) : null}
    </>
  );

  // A start picked on the home page, while it is still ahead.
  const wanted = stillAhead(draft.wantedStart);

  if (step === "service") {
    return (
      <>
        {top}
        {wanted ? (
          <div className="mb-4">
            <Alert kind="info">
              {t("book.pickedTime", { when: isolate(formatLocal(new Date(wanted), "EEEE dd/MM HH:mm", locale)) })}
            </Alert>
          </div>
        ) : null}
        <h2 className="mb-4 text-xl font-bold">{t("service.title")}</h2>
        <ServiceStep
          chosen={chosen}
          services={services}
          tags={tags}
          csrf={csrf}
          maxLines={settings["booking.maxLines"]}
          narrow={tags.param ? search[tags.param.name] : undefined}
        />
      </>
    );
  }

  if (step === "time") {
    const today = localDateOf(new Date());
    const serviceIds = draft.serviceIds;
    const fromWanted = !search.date && wanted !== null;
    let date = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) && search.date >= today ? search.date : today;
    if (fromWanted) date = localDateOf(new Date(wanted));
    let result = await getWeek({ date, serviceIds });
    // A start picked earlier opens its own day and is offered if it fits these services.
    const picked =
      fromWanted && wanted
        ? { start: wanted, fits: result.ok && result.week.slots.some((slot) => slot.toISOString() === wanted) }
        : null;
    // With no day chosen yet, open on the first day that has a free time.
    const first = result.ok ? result.week.firstAvailable : null;
    if (!search.date && !picked?.fits && first && first.date !== date) {
      date = first.date;
      result = await getWeek({ date, serviceIds });
    }
    return (
      <>
        {top}
        {/* The chosen service stays in view, so a service link from the site shows here. */}
        <div className="card mb-4 flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
            <Icon name="check" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink-muted">{t("time.service")}</span>
            <span className="block font-bold">
              {chosen.map((service) => pick(locale, service, "name")).join(", ")}
            </span>
          </span>
          <a href={lp("/book?step=service")} className="text-sm font-semibold text-brand-strong">
            {t("time.changeService")}
          </a>
        </div>
        <h2 className="mb-4 text-xl font-bold">{t("time.title")}</h2>
        {result.ok ? (
          <TimePicker
            initial={{
              date,
              lengthMin: result.week.lengthMin,
              days: result.week.days,
              slots: result.week.slots.map((slot) => slot.toISOString()),
              firstAvailable: result.week.firstAvailable
                ? { date: result.week.firstAvailable.date, start: result.week.firstAvailable.start.toISOString() }
                : null,
            }}
            csrf={csrf}
            action="/api/booking/draft"
            hidden={{ action: "chooseTime" }}
            basePath={lp("/book?step=time&")}
            apiQuery=""
            picked={picked}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Alert kind="error">{errorText(t, result.reason)}</Alert>
            {callButton}
          </div>
        )}
        <a href={lp("/book?step=service")} className="btn btn-secondary mt-6 w-fit">
          {t("book.back")}
        </a>
      </>
    );
  }

  if (step === "contact") {
    const errorField = search.error?.match(/^(name|phone|email)(?:Invalid|Required)$/)?.[1] as
      "name" | "phone" | "email" | undefined;
    const names = draft.serviceIds.map((id) => {
      const service = services.find((candidate) => candidate.id === id);
      return service ? pick(locale, service, "name") : "";
    });
    const summary = t("contact.summary", {
      pets: names.join(", "),
      when: formatLocal(new Date(draft.start!), "EEEE dd/MM HH:mm", locale),
    });
    const lines = draft.serviceIds.map((serviceId, index) => ({
      serviceId,
      serviceName: names[index]!,
      typed: draft.details[index] ?? {},
    }));
    return (
      <>
        {top}
        <h2 className="mb-4 text-xl font-bold">{t("details.title")}</h2>
        <ContactStep
          csrf={csrf}
          renderedAt={formTimestamp(secret)}
          summary={summary}
          lines={lines}
          errorField={errorField}
          emailRequired={!features.whatsappMessages}
        />
        <a href={lp("/book?step=time")} className="btn btn-secondary mt-6 w-fit">
          {t("book.back")}
        </a>
      </>
    );
  }

  // Name where the code went, masked, so a wrong address shows at once.
  const sentText = draft.codeTo
    ? t(draft.codeChannel === "email" ? "code.sentEmailTo" : "code.sentWhatsappTo", { to: isolate(draft.codeTo) })
    : draft.codeChannel === "email"
      ? t("code.sentEmail")
      : draft.codeChannel
        ? t("code.sentWhatsapp")
        : null;
  return (
    <>
      {top}
      <h2 className="mb-2 text-xl font-bold">{t("code.title")}</h2>
      {sentText ? <p className="mb-1">{sentText}</p> : null}
      {draft.holdExpiresAt ? (
        <p className="mb-4 text-sm text-ink-muted">
          {t("code.holdUntil", { time: formatLocal(new Date(draft.holdExpiresAt), "HH:mm", locale) })}
        </p>
      ) : null}
      <CodeStep
        csrf={csrf}
        secondsSinceSent={secondsSince(draft.codeSentAt)}
        hasEmail={draft.hasEmail}
        codeChannel={draft.codeChannel}
        emailChange={draft.emailOnFile && draft.email ? { onFile: draft.emailOnFile, typed: draft.email } : null}
        whatsappOn={features.whatsappMessages && !settings["messaging.whatsappOutage"]}
        emailOn={features.emailMessages}
        callHref={phoneLink(profile.phoneE164)}
        callLabel={displayPhone(profile.phoneE164)}
        errorId={error ? "step-error" : undefined}
      />
      <form method="post" action="/api/booking/draft" className="mt-6">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="action" value="restart" />
        <button type="submit" className="btn btn-secondary">
          {t("book.restart")}
        </button>
      </form>
    </>
  );
}
