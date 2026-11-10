import type { Translations } from "@/i18n/content";
import { type Db, query, withTransaction } from "../db";
import { writeAudit } from "../audit";
import { isolate } from "@/i18n/t";
import { saveTranslations, translationsColumn } from "../translation";
import type { Channel } from "./types";

export type Template = {
  key: string;
  channel: Channel;
  /** In the site's default language. */
  body: string;
  subject: string | null;
  /** Optional wording in the other languages; a language left empty is sent in the default one. */
  translations: Translations;
  providerTemplate: string | null;
};

const TEMPLATE_COLUMNS = `key, channel, body_he as body, subject_he as subject,
  ${translationsColumn("message_template", "message_templates.key || ':' || message_templates.channel")},
  provider_template as "providerTemplate"`;

export async function getTemplate(key: string, channel: Channel, db?: Db): Promise<Template | null> {
  const [row] = await query<Template>(
    `select ${TEMPLATE_COLUMNS}
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
    `select ${TEMPLATE_COLUMNS}
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
 * stay the same, or the message would lose its time or link; wording in
 * another language, when given, must carry the same placeholders.
 */
export async function updateTemplate(
  key: string,
  channel: Channel,
  text: { body: string; subject: string | null; translations: Translations },
  staffId: number,
  db?: Db,
): Promise<"ok" | "locked" | "placeholders" | "missing"> {
  if (channel === "messaging") return "locked";
  return withTransaction(async (client) => {
    const before = await getTemplate(key, channel, client);
    if (!before) return "missing";
    if (placeholders(before.body) !== placeholders(text.body)) return "placeholders";
    for (const other of Object.values(text.translations)) {
      if (other?.body?.trim() && placeholders(other.body) !== placeholders(text.body)) return "placeholders";
    }
    await query(
      "update message_templates set body_he = $3, subject_he = $4 where key = $1 and channel = $2",
      [key, channel, text.body, text.subject],
      client,
    );
    await saveTranslations("message_template", `${key}:${channel}`, text.translations, client);
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
