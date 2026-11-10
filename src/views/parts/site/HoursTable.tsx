import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/t";
import { hourRanges, type OpeningHours } from "@/core/booking/hours";
import { ClockTime } from "./values";

/** The week's opening hours, Sunday first, one soft row per day with today in pink. */
export async function HoursTable({ hours, today, caption }: { hours: OpeningHours[]; today: number; caption: string }) {
  const { t } = await getI18n();
  return (
    <table className="w-full border-separate border-spacing-y-0.5 text-[15px] md:text-base">
      <caption className="visually-hidden">{caption}</caption>
      <tbody>
        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const day = hours.find((row) => row.weekday === weekday);
          const isToday = weekday === today;
          const ranges = hourRanges(day);
          const closed = ranges.length === 0;
          const cell = `px-3 py-2.5 md:px-4 md:py-3 ${isToday ? "bg-paper font-extrabold" : "font-semibold"} ${
            closed && !isToday ? "text-ink-muted" : ""
          }`;
          return (
            <tr key={weekday} aria-current={isToday ? "date" : undefined}>
              <th scope="row" className={`${cell} rounded-s-2xl text-start`}>
                {t(`day.${weekday}` as MessageKey)}
                {isToday ? <span> · {t("hours.today")}</span> : null}
              </th>
              <td className={`${cell} rounded-e-2xl text-end`}>
                {closed
                  ? t("hours.closed")
                  : ranges.map((range, index) => (
                      <span key={range.opens} className="block">
                        <ClockTime value={`${range.opens}–${range.closes}`} />
                        {index < ranges.length - 1 ? <span className="visually-hidden">, </span> : null}
                      </span>
                    ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
