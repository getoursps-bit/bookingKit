import type pg from "pg";
import type { z } from "zod";
import type { Locale } from "@/i18n/locales";
import type { Db } from "@/core/platform/db";
import type { Appointment } from "@/core/booking/appointments";
import type { Service } from "@/core/booking/catalog";
import type { HourRange } from "@/core/booking/hours";

// An extension is a client's customisation, added to the core through the
// points below and nothing else. Its folder is extensions/<id>/ with:
//   extension.ts   this manifest: data and server behaviour, no React, so the
//                  worker and the release scripts can load it
//   views.tsx      what it shows in pages (src/extension/views.ts), optional
// client.json lists the extensions that are on, and `pnpm brand` writes the
// two registries from that list, so an extension that is off is not in the
// build at all.
//
// A point is added only when a real extension needs it. The core asks the
// registry (src/extension/registry.ts) at each point and never names an
// extension.

type Group = { [key: string]: string | Group };
type Queryable = pg.Client | pg.PoolClient | pg.Pool;
export type Form = Record<string, string | undefined>;

/** What the core seed can tell an extension's seed. */
export type SeedContext = {
  /** The seeded services' ids by their key in db/seed/data.json. */
  serviceIds: ReadonlyMap<string, number>;
};

/** One line of a booking as an extension sees it: the service, and what the extension itself asked about it. */
export type LineOf<Details> = { position: number; serviceId: number; details: Details };

/**
 * Extra details on each line of a customer's booking, asked on the details
 * step. The extension owns their shape; the core carries them as JSON from
 * the form to the confirmed booking. The fields themselves are in the
 * extension's views (`lineFields`).
 */
export type BookingLines<Details> = {
  /** What was typed for line `index` on the details form. */
  read(form: Form, index: number): Details;
  /** Fills in what the chosen services already decide, before anything is checked. */
  prepare?(lines: LineOf<Details>[], db?: Db): Promise<Details[]>;
  /** The first thing missing, as the name of an "err.<name>" string, or null. */
  missing(details: Details): string | null;
  /** Checked again when the slot is taken; a reason refuses the booking. */
  check?(lines: LineOf<unknown>[], db: Db): Promise<"NoRule" | null>;
  /** Inside the confirming transaction, once the phone is proven: saves the details. */
  confirm(db: Db, appointment: Appointment, lines: LineOf<unknown>[], now: Date): Promise<void>;
};

/** A short label on a service ("dog", "cat") and a way to narrow the list by it. */
export type ServiceTags = {
  /** The address parameter that narrows the list, for example "species", and the values it takes. */
  param?: { name: string; values: readonly string[] };
  load(
    locale: Locale,
    db?: Db,
  ): Promise<{ label(serviceId: number): string | undefined; matches(serviceId: number, value: string): boolean }>;
};

/** What an extension knows about one booked line: a name for it and notes for the owner. */
export type LineDescription = { label: string | null; notes: string[] };

/** The result of one of the owner's form actions: where to go back to and what to say. */
export type ActionResult = { section: string; ok?: string; error?: string };

export type Extension = {
  /** The folder name: lower case, digits and dashes. */
  id: string;
  /** Extensions this one needs on. */
  requires?: readonly string[];
  /** Its interface strings, by language code, nested like a pack's messages.json. They may reword a core string. */
  messages?: Record<string, Group>;
  /** Writes its starting content; rows that exist are left alone, like the core's seed. */
  seed?: (db: Queryable, ctx: SeedContext) => Promise<void>;

  /** Extra details on each line of a booking. */
  bookingLines?: BookingLines<never>;
  /** Labels on services and a filter by them. */
  serviceTags?: ServiceTags;
  /** The service whose free times the home page shows. The core takes the first bookable one otherwise. */
  previewService?(services: Service[], db?: Db): Promise<Service | null>;
  /** Names and notes for booked lines, keyed "<appointment id>:<position>". */
  describeLines?(appointmentIds: number[], locale: Locale, db: Db): Promise<Map<string, LineDescription>>;
  /** What it holds about a customer, for the owner's merge, export and erase. */
  customerData?: {
    /** Its tables that have a `customer_id` column: moved on a merge, emptied on an erase. */
    tables: readonly string[];
    /** Removes what it holds about the customer in tables without that column, inside the erase. */
    erase?(customerId: number, db: Db): Promise<void>;
    /** Added to the customer's data export, under its own keys. */
    export?(customerId: number, db?: Db): Promise<Record<string, unknown>>;
  };
  /** Its part of the worker's daily clean-up, such as deleting old photos. Returns what it removed, for the log. */
  cleanup?(db: Db, now: Date): Promise<Record<string, number>>;
  /**
   * Its own settings, each with its type and default, stored with the core's.
   * Where the owner changes them is in its views (`settings`).
   */
  settings?: Record<string, z.ZodType>;
  /** Work the worker does for it every minute. Returns what it did, for the log. */
  minute?(db: Db, now: Date): Promise<Record<string, number>>;
  /** Jobs the worker runs for it once a day, at a local hour. A name is unique among all jobs. */
  daily?: readonly { name: string; hour: number; run(now: Date, db: Db): Promise<unknown> }[];
  /** A note for the owner on each of these bookings, shown with the booking on her today page and calendar. */
  bookingNotes?(appointmentIds: number[], db: Db): Promise<Map<number, string>>;
  /** What it cost in a month ("yyyy-mm-01"), for the owner's statistics. `label` is the key of a string with {cost}. */
  monthlyCost?(month: string, db: Db): Promise<{ label: string; agorot: number }>;
  /**
   * What it offers another extension, by that extension's id. The other
   * extension defines the shape and reads it; the core only carries it.
   */
  provides?: Record<string, unknown>;
  /**
   * Further opening ranges on a weekday, after the core's one, in order. The
   * core reads, checks and saves them with the day; the fields are in its
   * views (`hoursFields`).
   */
  openingRanges?: {
    /** The further ranges of each weekday that has any. */
    load(db?: Db): Promise<Map<number, HourRange[]>>;
    /** What the hours form says for a weekday; `first` is the core's range, null on a closed day. "invalid" refuses the form. */
    read(form: Form, weekday: number, first: HourRange | null): HourRange[] | "invalid";
    /** Inside the transaction that saves the day. */
    save(weekday: number, ranges: HourRange[], db: Db): Promise<void>;
  };
  /**
   * Makes a new online booking wait for an answer instead of confirming it
   * at once. The booking is then "pending": it keeps its time, and the
   * customer can still move or cancel it. The extension confirms it with the
   * core's `approvePending`, or cancels it.
   */
  approval?: {
    /** True when a booking whose phone was just proven should wait. */
    needed(db: Db): Promise<boolean>;
    /** Inside the transaction that settles it, in place of the confirmation: tells the customer and the owner. */
    requested(appointment: Appointment, db: Db, now: Date): Promise<void>;
  };
  /**
   * Customer messages of its own, by kind. They are routed like the core's
   * booking messages, with {when} and {link}; the extension seeds their
   * templates under the same key as the kind.
   */
  customerMessages?: Record<
    string,
    {
      /** False drops a queued message the booking no longer calls for. */
      still?(appointment: Appointment, db: Db): Promise<boolean>;
      /** More values for the template, in the language it is sent in. */
      vars?(appointment: Appointment, locale: Locale, db: Db): Promise<Record<string, string>>;
    }
  >;
  /** Form actions of the owner's content screen that belong to the extension, by the form's `action`. */
  catalogActions?: Record<string, (form: Form, ctx: { staffId: number }) => Promise<ActionResult>>;
};

/** Marks a manifest as an extension, keeping its type exact. */
export function defineExtension<T extends Extension>(extension: T): T {
  return extension;
}

/** Lets an extension give its line details their own type while the core stores them untyped. */
export function bookingLines<Details>(point: BookingLines<Details>): BookingLines<never> {
  return point as unknown as BookingLines<never>;
}
