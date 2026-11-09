import { EXTENSIONS } from "@/extensions.generated";
import type { BookingLines, Extension } from "./types";

// The extensions that are on for this client, in the order client.json lists
// them. Everything the core asks an extension goes through here.

const byId = new Map<string, Extension>(EXTENSIONS.map((extension) => [extension.id, extension]));

for (const extension of EXTENSIONS) {
  for (const needed of extension.requires ?? []) {
    if (!byId.has(needed)) throw new Error(`Extension "${extension.id}" needs "${needed}", which is not on in client.json`);
  }
}

/** Every extension that is on. */
export function extensions(): readonly Extension[] {
  return EXTENSIONS;
}

/** True when the extension is on for this client. For tests and tooling; the core asks for points, not names. */
export function hasExtension(id: string): boolean {
  return byId.has(id);
}

/** The first extension that fills a point, with the point. Most points make sense once. */
export function firstWith<Key extends keyof Extension>(key: Key): NonNullable<Extension[Key]> | undefined {
  return EXTENSIONS.find((extension) => extension[key] !== undefined)?.[key] as NonNullable<Extension[Key]> | undefined;
}

/** Every extension that asks for details on a booking's lines, with its id (the key its details are stored under). */
export function bookingLinePoints(): { id: string; point: BookingLines<unknown> }[] {
  return EXTENSIONS.flatMap((extension) =>
    extension.bookingLines ? [{ id: extension.id, point: extension.bookingLines as unknown as BookingLines<unknown> }] : [],
  );
}
