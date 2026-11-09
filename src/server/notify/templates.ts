import { type Db, query, withTransaction } from "../db";
import { writeAudit } from "../repos/audit";
import { isolate } from "@/i18n/t";
import type { Channel } from "./types";

export type Template = {
  key: string;
  channel: Channel;
  bodyHe: string;
  subjectHe: string | null;
  /** Optional English wording; empty means the Hebrew is sent. */
  bodyEn: string | null;
  subjectEn: string | null;
  providerTemplate: string | null;
};

export async function getTemplate(key: string, channel: Channel, db?: Db): Promise<Template | null> {
  const [row] = await query<Template>(
    `select key, channel, body_he as "bodyHe", subject_he as "subjectHe", body_en as "bodyEn",
       subject_en as "subjectEn", provider_template as "providerTemplate"
     from message_templates where key = $1 and channel = $2`,
    [key, channel],
    db,
  );
  return row ?? null;
}

/**
 * Fills `{name}` placeholders. Values are wrapped as left-to-right islands so
 * times, codes and links keep their order inside Hebrew text. Returns the text
 * and the values in placeholder order, for WhatsApp template parameters.
 */
export function render(body: string, vars: Record<string, string>): { text: string; params: string[] } {
  const params: string[] = [];
  const text = body.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = vars[name];
    if (value === undefined) return placeholder;
    params.push(value);
    return isolate(value);
  });
  return { text, params };
}

export async function listTemplates(db?: Db): Promise<Template[]> {
  return query<Template>(
    `select key, channel, body_he as "bodyHe", subject_he as "subjectHe", body_en as "bodyEn",
       subject_en as "subjectEn", provider_template as "providerTemplate"
     from message_templates order by key, channel`,
    [],
    db,
  );
}

function placeholders(text: string): string {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
}

/**
 * The owner edits email and push wording. WhatsApp text is fixed by the
 * template Meta approved, so it is not editable here. The placeholders must
 * stay the same, or the message would lose its time or link; English text,
 * when given, must carry the same placeholders as the Hebrew.
 */
export async function updateTemplate(
  key: string,
  channel: Channel,
  text: { bodyHe: string; subjectHe: string | null; bodyEn: string | null; subjectEn: string | null },
  staffId: number,
  db?: Db,
): Promise<"ok" | "locked" | "placeholders" | "missing"> {
  if (channel === "whatsapp") return "locked";
  return withTransaction(async (client) => {
    const before = await getTemplate(key, channel, client);
    if (!before) return "missing";
    if (placeholders(before.bodyHe) !== placeholders(text.bodyHe)) return "placeholders";
    if (text.bodyEn?.trim() && placeholders(text.bodyEn) !== placeholders(text.bodyHe)) return "placeholders";
    await query(
      `update message_templates set body_he = $3, subject_he = $4, body_en = $5, subject_en = $6
       where key = $1 and channel = $2`,
      [key, channel, text.bodyHe, text.subjectHe, text.bodyEn?.trim() || null, text.subjectEn?.trim() || null],
      client,
    );
    await writeAudit(client, {
      staffId,
      actor: "staff",
      entity: "message_templates",
      entityId: `${key}:${channel}`,
      action: "update",
      before,
      after: text,
    });
    return "ok";
  }, db);
}
