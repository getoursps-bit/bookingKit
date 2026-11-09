import type { ReactNode } from "react";
import { VIEWS } from "@/extension-views.generated";
import type { Appointment } from "@/server/repos/appointments";

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
