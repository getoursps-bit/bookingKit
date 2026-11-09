import type { ReactElement } from "react";
import * as dogGrooming from "./dog-grooming";

// Campaign landing pages, written as code by the developer. To add one, create
// src/landing/<slug>.tsx exporting `meta` (one per language) and a default component, and list it here.

export type LandingMeta = { title: string; description: string };
/** `meta` has the default language at least; another language without its own text reads it. */
export type LandingPage = { meta: Record<string, LandingMeta>; default: () => Promise<ReactElement> | ReactElement };

export const LANDING_PAGES: Record<string, LandingPage> = {
  "dog-grooming": dogGrooming,
};
