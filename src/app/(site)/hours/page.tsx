import { HoursTable } from "@/components/site/HoursTable";
import { PageHeader } from "@/components/site/PageHeader";
import { Time } from "@/components/site/values";
import { getI18n } from "@/i18n/server";
import { weekdayOf } from "@/core/booking/slots";
import { listTimeOff } from "@/core/booking/catalog";
import { pageMetadata } from "@/core/website/seo";
import { getSiteData, isNoindex } from "@/core/website/site";
import { localDateOf } from "@/core/platform/time";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("hours.title"), path: "/hours" }, isNoindex(settings));
}

export default async function HoursPage() {
  const { t } = await getI18n();
  const { hours } = await getSiteData();
  const now = new Date();
  const timeOff = await listTimeOff(now, new Date(now.getTime() + 30 * 24 * 60 * 60_000));
  return (
    <>
      <PageHeader icon="clock" title={t("hours.title")} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <HoursTable hours={hours} today={weekdayOf(localDateOf(now))} caption={t("hours.title")} />
        </div>
        <section aria-labelledby="time-off">
          <h2 id="time-off" className="section-title mb-4">
            {t("hours.timeOffTitle")}
          </h2>
          {timeOff.length === 0 ? (
            <p className="card p-5 text-ink-muted">{t("hours.noTimeOff")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {timeOff.map((entry) => (
                <li key={entry.id} className="card p-4">
                  <Time value={entry.start} /> – <Time value={entry.end} />
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
