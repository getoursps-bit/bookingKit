import { Duration } from "@/components/site/values";
import { Icon } from "@/components/ui/Icon";
import { pick } from "@/i18n/content";
import { formatPrice } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Service } from "@/server/repos/catalog";
import type { Tags } from "@/server/serviceTags";
import { MULTI_LINE_BOOKING } from "@/server/booking/draft";
import { FormSecrets } from "./parts";
import { SubmitButton } from "./SubmitButton";

const ACTION = "/api/booking/draft";

/**
 * Step 1: the services to choose from; a press goes on to the time step. The
 * one chosen earlier is marked. With multi-pet booking on, the chosen ones are
 * listed first, each with its length and "from" price, and the list below
 * adds one more service. `narrow` filters the list by an extension's
 * service tags, for a landing page.
 */
export async function ServiceStep({
  chosen,
  services,
  tags,
  csrf,
  maxLines,
  narrow,
}: {
  chosen: Service[];
  services: Service[];
  tags: Tags;
  csrf: string;
  maxLines: number;
  /** A value of the extension's service filter, from the address ("dog"). */
  narrow?: string;
}) {
  const { t, locale, lp } = await getI18n();
  const multi = MULTI_LINE_BOOKING;
  const full = multi && chosen.length >= maxLines;
  // The first-time wording ("Choose") when each press replaces the choice.
  const adding = multi && chosen.length > 0;
  const shown = tags.narrow(services, narrow);
  const narrowed = Boolean(narrow && tags.param?.values.includes(narrow));
  const facts = (service: Service) => (
    <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
      <span className="inline-flex items-center gap-1">
        <Icon name="clock" size={14} />
        <Duration minutes={service.durationMin} />
      </span>
      <span aria-hidden="true">·</span>
      <span>{t("services.from", { price: formatPrice(service.priceFromAgorot, locale) })}</span>
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      {multi ? (
        <section aria-labelledby="services-chosen" className="card p-5">
          <h2 id="services-chosen" className="mb-3 text-lg font-bold">
            {t("service.chosen")}
          </h2>
          {chosen.length === 0 ? (
            <p className="text-ink-muted">{t("service.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {chosen.map((service, index) => (
                <li key={index} className="flex items-center gap-3 rounded-2xl border border-brand bg-brand-soft p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
                    <Icon name="check" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {chosen.length > 1 ? (
                      <span className="block text-xs font-semibold text-brand-strong">
                        {t("service.lineN", { n: index + 1 })}
                      </span>
                    ) : null}
                    <span className="block font-bold">{pick(locale, service, "name")}</span>
                    {facts(service)}
                  </span>
                  <form method="post" action={ACTION}>
                    <FormSecrets csrf={csrf} />
                    <input type="hidden" name="action" value="removeService" />
                    <input type="hidden" name="index" value={index} />
                    <button type="submit" className="btn btn-secondary min-h-10 px-3 text-sm">
                      <Icon name="close" size={16} />
                      {t("service.remove")}
                      <span className="visually-hidden"> {pick(locale, service, "name")}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {chosen.length > 0 ? (
            <form method="post" action={ACTION} className="mt-4 flex justify-end">
              <FormSecrets csrf={csrf} />
              <input type="hidden" name="action" value="toTime" />
              <SubmitButton className="btn btn-primary min-h-12 px-8">
                {t("service.toTime")}
                <Icon name="arrow" className="ltr:rotate-180" />
              </SubmitButton>
            </form>
          ) : null}
        </section>
      ) : null}

      {full ? (
        <p className="text-ink-muted">{t("service.max", { n: maxLines })}</p>
      ) : (
        <section aria-labelledby="services-choose" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="services-choose" className="text-lg font-bold">
              {adding ? t("service.anotherTitle") : t("service.chooseTitle")}
            </h2>
            {narrowed ? (
              <a href={lp("/book?step=service")} className="text-sm font-semibold text-brand-strong">
                {t("service.showAll")}
              </a>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2">
            {shown.map((service) => {
              const name = pick(locale, service, "name");
              const includes = pick(locale, service, "includes");
              const tag = tags.label(service);
              const current = !multi && chosen.some((candidate) => candidate.id === service.id);
              return (
                <li
                  key={service.id}
                  className={`card flex items-center gap-3 p-4 ${current ? "border-brand bg-brand-soft" : ""}`}
                  aria-current={current ? "true" : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{name}</span>
                    {tag ? <span className="block text-sm text-ink-muted">{tag}</span> : null}
                    {includes ? <span className="block text-sm text-ink-muted">{includes}</span> : null}
                    {facts(service)}
                  </span>
                  {service.bookableOnline ? (
                    <form method="post" action={ACTION}>
                      <FormSecrets csrf={csrf} />
                      <input type="hidden" name="action" value="addService" />
                      <input type="hidden" name="serviceId" value={service.id} />
                      <SubmitButton className={`btn ${adding ? "btn-secondary" : "btn-primary"} min-h-11 px-4`}>
                        {adding ? t("service.add") : t("home.choose")}
                        <span className="visually-hidden">: {name}</span>
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="flex max-w-[9rem] items-center gap-1.5 text-sm text-ink-muted">
                      <Icon name="phone" size={16} className="shrink-0" />
                      {t("services.callToBook")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
