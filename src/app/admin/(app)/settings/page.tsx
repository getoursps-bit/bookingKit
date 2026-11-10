import { ActionForm, AdminNotice, Panel } from "@/components/admin/parts";
import { getI18n } from "@/i18n/server";
import type { MessageKey, Translate } from "@/i18n/t";
import { displayPhone } from "@/server/links";
import { extensionViews } from "@/extension/views";
import { getAllSettings } from "@/server/repos/settings";
import { requireStaffPage } from "@/server/staff/session";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.nav.settings") };
}

const GROUPS: { id: string; title: MessageKey; keys: string[] }[] = [
  {
    id: "booking",
    title: "settings.bookingTitle",
    keys: [
      "booking.slotStepMin",
      "booking.gapMin",
      "booking.bufferMin",
      "booking.noticeMin",
      "booking.horizonDays",
      "booking.maxLines",
      "booking.cutoffHours",
      "booking.holdMin",
    ],
  },
  { id: "features", title: "settings.features", keys: ["messaging.whatsappOutage", "site.noindex"] },
  { id: "numbers", title: "settings.numbers", keys: ["whatsapp.senderNumber", "whatsapp.chatNumber"] },
  { id: "caps", title: "settings.caps", keys: ["cap.messagesMonthly"] },
];

function SettingInput({
  t,
  name,
  value,
  disabled,
}: {
  t: Translate;
  name: string;
  value: unknown;
  disabled: boolean;
}) {
  const label = t(`settings.${name}` as MessageKey);
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-3 rounded-2xl bg-paper p-3">
        <input id={name} type="checkbox" name={name} defaultChecked={value} disabled={disabled} className="size-5 accent-brand" />
        <span>{label}</span>
      </label>
    );
  }
  const phone = name.startsWith("whatsapp.");
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        id={name}
        name={name}
        type={phone ? "tel" : "number"}
        inputMode={phone ? "tel" : "numeric"}
        min={phone ? undefined : 0}
        dir="ltr"
        required={!phone}
        defaultValue={phone ? (value ? (displayPhone(String(value)) ?? String(value)) : "") : String(value)}
        aria-describedby={phone ? "phone-help" : undefined}
        className="input text-end"
      />
    </label>
  );
}

/** Booking rules, switches, the two WhatsApp numbers and the monthly caps. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const notice = await searchParams;
  const { csrf } = await requireStaffPage();
  const { t } = await getI18n();
  const settings = await getAllSettings();
  // The extensions' settings join the core's: switches first in "features", limits last in "caps".
  const extra = extensionViews().flatMap((views) => (views.settings ? [{ ...views.settings, why: views.settings.off?.() ?? null }] : []));
  const off = new Set(extra.flatMap((part) => (part.why ? (part.features ?? []) : [])));
  const offNotes = [...new Set(extra.flatMap((part) => (part.why ? [part.why] : [])))];
  const groups = GROUPS.map((group) =>
    group.id === "features"
      ? { ...group, keys: [...extra.flatMap((part) => part.features ?? []), ...group.keys] }
      : group.id === "caps"
        ? { ...group, keys: [...group.keys, ...extra.flatMap((part) => part.caps ?? [])] }
        : group,
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">{t("admin.nav.settings")}</h1>
      <AdminNotice {...notice} />
      {groups.map((group) => {
        // A disabled checkbox sends nothing, which would read as "off"; leave such keys out of the form.
        const keys = group.keys.filter((key) => !off.has(key));
        return (
          <Panel key={group.id} id={group.id} title={t(group.title)}>
            <ActionForm
              action="/api/admin/settings"
              csrf={csrf}
              name="save"
              hidden={{ keys: keys.join(",") }}
              className="flex flex-col gap-3"
            >
              <div className={`grid gap-3 ${group.id === "features" ? "" : "sm:grid-cols-2"}`}>
                {group.keys.map((key) => (
                  <SettingInput key={key} t={t} name={key} value={settings[key]} disabled={!keys.includes(key)} />
                ))}
              </div>
              {group.id === "features"
                ? offNotes.map((why) => (
                    <p key={why} className="text-sm text-ink-muted">
                      {t(why as MessageKey)}
                    </p>
                  ))
                : null}
              {group.id === "numbers" ? (
                <p id="phone-help" className="text-sm text-ink-muted">
                  {t("settings.phoneHelp")}
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary self-start">
                {t("admin.save")}
              </button>
            </ActionForm>
          </Panel>
        );
      })}
    </div>
  );
}
