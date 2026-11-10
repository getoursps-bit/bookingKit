import { ActionForm, AdminNotice, Panel } from "@/views/parts/admin/parts";
import { Time } from "@/views/parts/site/values";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/t";
import { bookingsBetween } from "@/core/booking/owner-data";
import { getOpeningHours, listTimeOff } from "@/core/booking/catalog";
import { requireStaffPage } from "@/core/platform/staff/session";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.hours") };
}

// Quarter hours from 06:00 to 22:00, as a list: shows 24-hour times on every phone.
const TIMES = Array.from({ length: 65 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

function TimeSelect({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="field min-w-0">
      <span className="field-label text-xs">{label}</span>
      <select name={name} defaultValue={value} dir="ltr" className="input min-w-0">
        {TIMES.includes(value) ? null : <option value={value}>{value}</option>}
        {TIMES.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
    </label>
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Weekly opening hours and time off. A time off over booked visits lists them with "cancel and notify". */
export default async function HoursPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const search = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t } = await getI18n();
  const days = WEEKDAYS.map((weekday) => t(`day.${weekday}` as MessageKey));
  const hours = await getOpeningHours();
  const now = new Date();
  const timeOff = await listTimeOff(now, new Date(now.getTime() + 365 * 86_400_000));
  const affected = await Promise.all(
    timeOff.map((entry) => bookingsBetween(entry.start, entry.end, { statuses: ["confirmed"] })),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.hours")}</h1>
      <AdminNotice {...search} />
      <Panel id="weekly" title={t("hours.weekly")}>
        <ActionForm action="/api/admin/hours" csrf={csrf} name="weekly" className="flex flex-col gap-2">
          {days.map((day, weekday) => {
            const row = hours.find((entry) => entry.weekday === weekday);
            return (
              <fieldset key={weekday} className="flex flex-col gap-2 rounded-2xl bg-paper p-3">
                <legend className="visually-hidden">{day}</legend>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold" aria-hidden>
                    {day}
                  </span>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`closed.${weekday}`} defaultChecked={row?.closed ?? true} className="size-5 accent-brand" />
                    {t("hours.closedDay")}
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TimeSelect name={`opens.${weekday}`} label={t("hours.opens")} value={row?.opens ?? "09:00"} />
                  <TimeSelect name={`closes.${weekday}`} label={t("hours.closes")} value={row?.closes ?? "16:00"} />
                </div>
              </fieldset>
            );
          })}
          <button type="submit" className="btn btn-primary self-start">
            {t("admin.save")}
          </button>
        </ActionForm>
      </Panel>

      <Panel id="timeoff" title={t("hours.timeOff")}>
        {timeOff.length === 0 ? <p className="mb-4 text-ink-muted">{t("admin.none")}</p> : null}
        <ul className="mb-4 flex flex-col gap-3">
          {timeOff.map((entry, index) => (
            <li key={entry.id} className="rounded-2xl bg-paper p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Time value={entry.start} /> – <Time value={entry.end} />
                  {entry.reason ? <span className="text-ink-muted"> · {entry.reason}</span> : null}
                </span>
                <ActionForm action="/api/admin/hours" csrf={csrf} name="remove" hidden={{ id: entry.id }}>
                  <button type="submit" className="btn btn-secondary">
                    {t("admin.delete")}
                  </button>
                </ActionForm>
              </div>
              {affected[index]!.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  <p className="font-semibold text-danger">{t("hours.affected")}</p>
                  <ul className="text-sm">
                    {affected[index]!.map((booking) => (
                      <li key={booking.id}>
                        <a href={`/admin/calendar?appointment=${booking.id}`} className="underline">
                          <Time value={booking.start} pattern="EEEEEE dd/MM HH:mm" /> · {booking.customerName}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <ActionForm action="/api/admin/hours" csrf={csrf} name="cancelAffected" hidden={{ id: entry.id }}>
                    <button type="submit" className="btn bg-danger text-white">
                      {t("hours.cancelAffected")}
                    </button>
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <ActionForm action="/api/admin/hours" csrf={csrf} name="timeoff" className="grid gap-3 sm:grid-cols-2">
          <label className="field min-w-0">
            <span className="field-label">{t("hours.from")}</span>
            <span className="flex gap-2">
              <input type="date" name="fromDate" required dir="ltr" className="input min-w-0 flex-1" />
              <select name="fromTime" dir="ltr" className="input min-w-0 w-28" aria-label={t("hours.opens")} defaultValue="">
                <option value="">{t("hours.allDay")}</option>
                {TIMES.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="field min-w-0">
            <span className="field-label">{t("hours.to")}</span>
            <span className="flex gap-2">
              <input type="date" name="toDate" required dir="ltr" className="input min-w-0 flex-1" />
              <select name="toTime" dir="ltr" className="input min-w-0 w-28" aria-label={t("hours.closes")} defaultValue="">
                <option value="">{t("hours.allDay")}</option>
                {TIMES.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="field sm:col-span-2">
            <span className="field-label">{t("hours.reason")}</span>
            <input name="reason" maxLength={200} className="input min-w-0" />
          </label>
          <button type="submit" className="btn btn-primary self-start">
            <span aria-hidden>+</span> {t("admin.add")}
          </button>
        </ActionForm>
      </Panel>
    </div>
  );
}
