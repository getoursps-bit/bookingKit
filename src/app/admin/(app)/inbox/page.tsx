import { ActionForm, AdminNotice, Panel } from "@/components/admin/parts";
import { Phone, Time } from "@/components/site/values";
import { Icon } from "@/components/ui/Icon";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/t";
import { failedMessages, recentEvents, recentReplies } from "@/server/admin/data";
import { requireStaffPage } from "@/server/staff/session";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.inbox") };
}

/** All owner events (read and unread), customer replies to the automated number, and messages that failed. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const notice = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t } = await getI18n();
  const [events, replies, failed] = await Promise.all([recentEvents({ limit: 100 }), recentReplies(50), failedMessages(50)]);
  const unread = events.some((event) => !event.readAt);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.inbox")}</h1>
      <AdminNotice {...notice} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          id="events"
          title={t("inbox.events")}
          action={
            unread ? (
              <ActionForm action="/api/admin/inbox" csrf={csrf} name="readAll">
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
                <li key={event.id} className={`flex flex-wrap items-center gap-3 rounded-2xl p-3 ${event.readAt ? "bg-surface" : "bg-paper"}`}>
                  <Icon name="bell" className={event.readAt ? "text-ink-muted" : "text-brand"} />
                  <span className={`flex-1 ${event.readAt ? "" : "font-semibold"}`}>{t(`event.${event.type}` as MessageKey)}</span>
                  <Time value={event.createdAt} pattern="dd/MM HH:mm" />
                  {event.appointmentId ? (
                    <a href={`/admin/calendar?appointment=${event.appointmentId}`} className="text-sm underline">
                      {t("cal.details")}
                    </a>
                  ) : null}
                  {!event.readAt ? (
                    <ActionForm action="/api/admin/inbox" csrf={csrf} name="read" hidden={{ id: event.id }}>
                      <button type="submit" className="grid size-10 place-items-center rounded-full hover:bg-brand-soft">
                        <Icon name="check" />
                        <span className="visually-hidden">{t("inbox.markRead")}</span>
                      </button>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel id="replies" title={t("inbox.replies")}>
            <p className="mb-3 text-sm text-ink-muted">{t("inbox.repliesHelp")}</p>
            {replies.length === 0 ? (
              <p className="text-ink-muted">{t("admin.none")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {replies.map((reply) => (
                  <li key={reply.id} className="rounded-2xl bg-paper p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{reply.customerName ?? "—"}</span>
                      <a href={`tel:${reply.fromNumber}`} className="underline">
                        <Phone e164={reply.fromNumber} />
                      </a>
                      <span className="ms-auto text-ink-muted">
                        <Time value={reply.receivedAt} pattern="dd/MM HH:mm" />
                      </span>
                    </div>
                    {reply.body ? <p className="mt-1 whitespace-pre-line">{reply.body}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="failed" title={t("inbox.failed")}>
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
                    {message.appointmentId ? (
                      <a href={`/admin/calendar?appointment=${message.appointmentId}`} className="text-sm underline">
                        {t("cal.details")}
                      </a>
                    ) : null}
                    <Time value={message.updatedAt} pattern="dd/MM HH:mm" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
