// Generated from client.json by `pnpm brand`. Do not edit: change client.json and run it again.
import { he as heDates, enGB as enDates } from "date-fns/locale";
import heMessages from "../../languages/he/messages.json";
import enMessages from "../../languages/en/messages.json";
import type { Locale } from "./languages.generated";

export const MESSAGES = { he: heMessages, en: enMessages };
export const DATE_LOCALES: Record<Locale, typeof heDates> = { he: heDates, en: enDates };
