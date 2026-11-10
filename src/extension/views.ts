import type { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { VIEWS } from "@/extension-views.generated";
import type { Appointment } from "@/core/booking/appointments";

// What an extension shows in the core's pages: extensions/<id>/views.tsx.
// Kept apart from the manifest so the worker and the release scripts never
// load React. Only pages import this file.

/** A page of its own under /l/<slug>. */
export type ExtensionLandingPage = {
  /** Has the default language at least; another language without its own text reads it. */
  meta: Record<string, { title: string; description: string }>;
  default: () => Promise<ReactNode> | ReactNode;
};

export type ExtensionViews = {
  /** The same id as the manifest. */
  id: string;
  /** The fields for one line on the details step. `typed` is what was sent before, after an error. */
  lineFields?(props: { index: number; count: number; serviceId: number; serviceName: string; typed: unknown }): ReactNode;
  /** On the customer's private link, under the booking. */
  manage?(props: { token: string; csrf: string; appointment: Appointment }): ReactNode;
  /** The notice the private link shows after one of the extension's actions: the `done` value in the address, to the key of its string. */
  manageNotices?: Record<string, string>;
  /** On the owner's customer record, after the contact details. */
  customer?(props: { customerId: number }): ReactNode;
  /** On the owner's content screen, after the services. */
  catalog?(props: { csrf: string }): ReactNode;
  /**
   * List items it adds to the privacy notice: what is collected, who it is
   * shared with, and (replacing the core's sentence) how long things are kept.
   * `language` is the language the notice is written in. Null for nothing.
   */
  privacy?(props: { part: "collected" | "shared" | "kept"; language: string }): ReactNode | null;
  /**
   * Where its settings (the manifest's `settings`) go on the owner's settings
   * screen: switches under "features", monthly limits under "caps". `off`
   * gives the key of a string that says why the switches cannot work yet (a
   * missing key, say); they are then shown but cannot be changed.
   */
  settings?: { features?: readonly string[]; caps?: readonly string[]; off?(): string | null };
  /**
   * Shortcuts it adds to the contact row, after the core's navigation
   * button. One with no `href` (the owner has not filled in what it needs)
   * is left out. `icon` is the name of one of the kit's icons.
   */
  contactLinks?(profile: { address: string | null; city: string | null }): { key: string; label: string; icon: string; href: string | null }[];
  /** More fields for one weekday on the owner's hours form, under the core's opening and closing time. `more` is what its manifest's `openingRanges` loaded. */
  hoursFields?(props: { weekday: number; more: { opens: string; closes: string }[] }): ReactNode;
  /** Forms its views post, by name: served at /api/ext/<id>/<name>. The handler checks its own form. */
  actions?: Record<string, (request: NextRequest) => Promise<Response>>;
  /** Campaign pages, by slug. */
  landingPages?: Record<string, ExtensionLandingPage>;
};

/** Marks a views file, keeping its type exact. */
export function defineViews<T extends ExtensionViews>(views: T): T {
  return views;
}

/** The views of every extension that is on. */
export function extensionViews(): readonly ExtensionViews[] {
  return VIEWS;
}

/** Every campaign page the extensions bring, by slug. */
export function extensionLandingPages(): Record<string, ExtensionLandingPage> {
  return Object.assign({}, ...VIEWS.map((views) => views.landingPages ?? {})) as Record<string, ExtensionLandingPage>;
}
