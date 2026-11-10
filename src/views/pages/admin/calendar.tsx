import { Calendar } from "@/views/parts/admin/Calendar";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { getOpeningHours, listServices } from "@/core/booking/catalog";
import { hourRanges } from "@/core/booking/hours";
import { extensionAdminPages } from "@/extension/views";
import { requireStaffPage } from "@/core/platform/staff/session";

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
        pendingHref={extensionAdminPages().find((page) => page.pending)?.href ?? null}
        hours={hours.flatMap((day) => {
          const ranges = hourRanges(day);
          return ranges.length === 0 ? [null] : ranges.map((range) => ({ weekday: day.weekday, ...range }));
        })}
        services={services.map((service) => ({ id: service.id, name: pick(locale, service, "name"), durationMin: service.durationMin }))}
      />
    </div>
  );
}
