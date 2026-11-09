import type { NextRequest } from "next/server";
import { normalizePhone } from "@/server/links";
import { getSettings, SETTINGS_DEFAULTS, settingValid, type SettingKey, updateSetting } from "@/server/repos/settings";
import { adminRequest, backTo } from "@/server/staff/http";

export const dynamic = "force-dynamic";

const PHONE_KEYS: SettingKey[] = ["whatsapp.senderNumber", "whatsapp.chatNumber"];

/**
 * Saves the settings sent in one form. The kind of each value comes from its
 * default (number, switch or phone). All values are checked before any is
 * stored, and only changed values are written, so the audit log stays short.
 */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, staff } = req;
  const keys = (form.keys ?? "").split(",").filter((key): key is SettingKey => Object.hasOwn(SETTINGS_DEFAULTS, key));
  if (keys.length === 0) return backTo(request, "/admin/settings", { error: "invalid" });

  const values = new Map<SettingKey, unknown>();
  for (const key of keys) {
    const raw = form[key] ?? "";
    let value: unknown;
    if (PHONE_KEYS.includes(key)) value = raw.trim() ? normalizePhone(raw) : null;
    else if (typeof SETTINGS_DEFAULTS[key] === "boolean") value = raw === "on";
    else value = raw.trim() === "" ? NaN : Number(raw);
    if ((PHONE_KEYS.includes(key) && raw.trim() && !value) || !settingValid(key, value)) {
      return backTo(request, `/admin/settings#${key}`, { error: "invalid" });
    }
    values.set(key, value);
  }

  const current = await getSettings();
  for (const [key, value] of values) {
    if (current[key] !== value) await updateSetting(key, value as never, staff.id);
  }
  return backTo(request, "/admin/settings", { ok: "settings.saved" });
}
