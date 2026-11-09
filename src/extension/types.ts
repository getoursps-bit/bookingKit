import type pg from "pg";

// An extension is a client's customisation, added to the core through the
// points below and nothing else. Its folder is extensions/<id>/ with this
// manifest in extension.ts; client.json lists the ones that are on, and
// `pnpm brand` writes the registry (src/extensions.generated.ts) from that
// list, so an extension that is off is not in the build at all.
//
// The points grow only when a real extension needs one. Today:
//   strings     its own interface strings per language (languages/<code>.json)
//   migrations  its own tables, in extensions/<id>/migrations/*.sql, applied
//               after the core's by `pnpm migrate`, on or off
//   seed        its starting content, written after the core's seed

type Group = { [key: string]: string | Group };
type Queryable = pg.Client | pg.PoolClient | pg.Pool;

/** What the core seed can tell an extension's seed. */
export type SeedContext = {
  /** The seeded services' ids by their key in db/seed/data.json. */
  serviceIds: ReadonlyMap<string, number>;
};

export type Extension = {
  /** The folder name: lower case, digits and dashes. */
  id: string;
  /** Extensions this one needs on. */
  requires?: readonly string[];
  /** Its interface strings, by language code, nested like a pack's messages.json. */
  messages?: Record<string, Group>;
  /** Writes its starting content; rows that exist are left alone, like the core's seed. */
  seed?: (db: Queryable, ctx: SeedContext) => Promise<void>;
};

/** Marks a manifest as an extension, keeping its type exact. */
export function defineExtension<T extends Extension>(extension: T): T {
  return extension;
}
