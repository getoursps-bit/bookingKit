import { cache } from "react";
import { getOpeningHours, type OpeningHours } from "../booking/catalog";
import { type BusinessProfile, getBusinessProfile } from "./content";
import { getSettings, type Settings } from "../platform/settings";
import { brandName } from "@/brand";
import { DEFAULT_LOCALE } from "@/i18n/locales";

export type SiteData = { profile: BusinessProfile; hours: OpeningHours[]; settings: Settings };

const EMPTY_PROFILE: BusinessProfile = {
  name: brandName(DEFAULT_LOCALE),
  tagline: null,
  translations: {},
  city: null,
  address: null,
  phoneE164: null,
  social: {},
  logoKey: null,
  coverKey: null,
};

/** The salon details every public page needs, read once per request. */
export const getSiteData = cache(async (): Promise<SiteData> => {
  const [profile, hours, settings] = await Promise.all([getBusinessProfile(), getOpeningHours(), getSettings()]);
  return { profile: profile ?? EMPTY_PROFILE, hours, settings };
});

/** True while the site must stay out of search results: the environment switch or the admin setting. */
export function isNoindex(settings: Settings): boolean {
  return process.env.SITE_NOINDEX !== "false" || settings["site.noindex"];
}
