import { type ExtensionLandingPage, extensionLandingPages } from "@/extension/views";

// Campaign landing pages under /l/<slug>, written as code by the developer.
// A client's own pages come from its extensions (`landingPages` in the
// extension's views.tsx). A page every client should have goes in
// src/landing/<slug>.tsx, exporting `meta` and a default component, and is
// listed here.

export type LandingMeta = { title: string; description: string };
export type LandingPage = ExtensionLandingPage;

export const LANDING_PAGES: Record<string, LandingPage> = {
  ...extensionLandingPages(),
};
