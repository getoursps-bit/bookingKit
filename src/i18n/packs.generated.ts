// Generated from client.json by `pnpm brand`. Do not edit: change client.json and run it again.
import { he as heDates, enGB as enDates } from "date-fns/locale";
import heContent from "../../languages/he/content.json" with { type: "json" };
import enContent from "../../languages/en/content.json" with { type: "json" };
import heMessages from "../../languages/he/messages.json" with { type: "json" };
import enMessages from "../../languages/en/messages.json" with { type: "json" };
import type { Locale } from "./languages.generated";

export const MESSAGES = { he: heMessages, en: enMessages };
/** The starting content (services, products, message wording) in each language. */
export const CONTENT: Record<Locale, typeof heContent> = { he: heContent, en: enContent };
export const DATE_LOCALES: Record<Locale, typeof heDates> = { he: heDates, en: enDates };
