import type { ReactElement } from "react";
import type { Locale } from "@/i18n/locales";
import * as dogGrooming from "./dog-grooming";

// Campaign landing pages, written as code by the developer. To add one, create
// src/landing/<slug>.tsx exporting `meta` (one per language) and a default component, and list it here.

export type LandingMeta = { title: string; description: string };
export type LandingPage = { meta: Record<Locale, LandingMeta>; default: () => Promise<ReactElement> | ReactElement };

export const LANDING_PAGES: Record<string, LandingPage> = {
  "dog-grooming": dogGrooming,
};
