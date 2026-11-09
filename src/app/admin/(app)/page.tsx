import { EnablePush } from "@/components/admin/AdminPush";
import { ActionForm, AdminNotice, Panel } from "@/components/admin/parts";
import { Phone, Time } from "@/components/site/values";
import { Icon } from "@/components/ui/Icon";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/t";
import { bookingsBetween, failedMessages, ownerDevices, recentEvents } from "@/server/admin/data";
import { getConfig } from "@/server/config";
import { getFeatures } from "@/server/features";
import { requireStaffPage } from "@/server/staff/session";
import { localDateOf, localDayBounds } from "@/server/time";
import { addLocalDays } from "@/server/booking/slots";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.today") };
}

/** Today: the next bookings, new events, messages that failed, and alerts per device. */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const search = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t, locale } = await getI18n();
  const now = new Date();
  const today = localDateOf(now);
  const bookings = await bookingsBetween(now, localDayBounds(addLocalDays(today, 2)).end, { statuses: ["confirmed"], locale });
  const events = await recentEvents({ unreadOnly: true, limit: 20 });
  const failed = await failedMessages(20);
  const devices = await ownerDevices();
  const push = getFeatures().ownerPush;
  const vapidKey = getConfig().VAPID_PUBLIC_KEY ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.today")}</h1>
      <AdminNotice {...search} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="next" title={t("today.next")}>
          {bookings.length === 0 ? (
            <p className="text-ink-muted">{t("today.noBookings")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <a
                    href={`/admin/calendar?appointment=${booking.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-paper p-3 hover:bg-brand-soft"
                  >
                    <span className="min-w-20 font-bold">
                      <Time value={booking.start} pattern="EEEEEE HH:mm" />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold">{booking.customerName}</span>
                      <span className="block text-sm text-ink-muted">
                        {booking.lines.map((line) => [line.label, line.serviceName].filter(Boolean).join(" – ")).join(", ")}
                      </span>
                      {booking.summary ? (
                        <span className="mt-1 flex gap-1.5 text-sm">
                          <Icon name="sparkle" size={16} className="mt-0.5 shrink-0 text-brand" />
                          <span className="whitespace-pre-line">{booking.summary}</span>
                        </span>
                      ) : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="events"
          title={t("today.events")}
          action={
            events.length > 0 ? (
              <ActionForm action="/api/admin/inbox" csrf={csrf} name="readAll" hidden={{ back: "/admin" }}>
                <button type="submit" className="btn btn-secondary min-h-10 px-3 text-sm">
                  {t("inbox.markAll")}
                </button>
              </ActionForm>
            ) : null
          }
        >
          {events.length === 0 ? (
            <p className="text-ink-muted">{t("admin.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-3 rounded-2xl bg-paper p-3">
                  <Icon name="bell" className="text-brand" />
                  <span className="flex-1 font-semibold">{t(`event.${event.type}` as MessageKey)}</span>
                  <Time value={event.createdAt} pattern="dd/MM HH:mm" />
                  {event.appointmentId ? (
                    <a href={`/admin/calendar?appointment=${event.appointmentId}`} className="text-sm underline">
                      {t("cal.details")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="failed" title={t("today.failed")}>
          {failed.length === 0 ? (
            <p className="text-ink-muted">{t("admin.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {failed.map((message) => (
                <li key={message.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-3">
                  <span className="flex-1 font-semibold">{message.customerName ?? "—"}</span>
                  {message.phone ? (
                    <a href={`tel:${message.phone}`} className="btn btn-secondary min-h-10 px-3 text-sm">
                      <Icon name="phone" size={16} />
                      <Phone e164={message.phone} />
                    </a>
                  ) : null}
                  <Time value={message.updatedAt} pattern="dd/MM HH:mm" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="devices" title={t("today.devices")}>
          {!push || !vapidKey ? (
            <p className="text-ink-muted">{t("today.pushOff")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <EnablePush vapidKey={vapidKey} csrf={csrf} />
              {devices.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {devices.map((device) => (
                    <li key={device.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-3 text-sm">
                      <span className="flex-1 truncate" dir="ltr">
                        {(device.label ?? "").slice(0, 60)}
                      </span>
                      <span>
                        {device.lastReceiptAt ? (
                          <>
                            {t("today.lastReceipt", { time: "" }).replace(/⁨⁩/, "")}
                            <Time value={device.lastReceiptAt} pattern="dd/MM HH:mm" />
                          </>
                        ) : (
                          t("today.noReceipt")
                        )}
                      </span>
                      <ActionForm action="/api/admin/push" csrf={csrf} name="remove" hidden={{ id: device.id }}>
                        <button type="submit" className="btn btn-secondary min-h-10 px-3">
                          {t("today.removeDevice")}
                        </button>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action="/api/admin/push" csrf={csrf} name="test">
                <button type="submit" className="btn btn-secondary">
                  <Icon name="bell" />
                  {t("today.test")}
                </button>
              </ActionForm>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
