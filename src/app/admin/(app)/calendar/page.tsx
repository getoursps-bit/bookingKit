import { Calendar } from "@/components/admin/Calendar";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { getOpeningHours, listServices } from "@/server/repos/catalog";
import { requireStaffPage } from "@/server/staff/session";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("cal.title") };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ appointment?: string }> }) {
  const { appointment } = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t, locale } = await getI18n();
  const [services, hours] = await Promise.all([listServices({ activeOnly: true }), getOpeningHours()]);
  const focusId = appointment && /^\d+$/.test(appointment) ? Number(appointment) : null;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("cal.title")}</h1>
      <Calendar
        csrf={csrf}
        focusId={focusId}
        hours={hours.map((day) =>
          day.closed || !day.opens || !day.closes ? null : { weekday: day.weekday, opens: day.opens, closes: day.closes },
        )}
        services={services.map(({ id, nameHe, nameEn, durationMin }) => ({ id, name: pick(locale, nameHe, nameEn), durationMin }))}
      />
    </div>
  );
}
