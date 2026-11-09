import { EXTENSIONS } from "@/extensions.generated";
import type { Extension } from "./types";

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

/** True when the extension is on for this client. */
export function hasExtension(id: string): boolean {
  return byId.has(id);
}
