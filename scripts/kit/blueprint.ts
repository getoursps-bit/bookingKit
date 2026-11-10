import { z } from "zod";
import { BRAND_MARKS, type Client } from "../../src/brand.schema";

// A client's blueprint: the one file somebody fills in for a new client. It
// says who the client is, which extensions are on, what the business offers
// and when it is open, and what the client wishes for that the kit does not
// do yet. `pnpm kit new` turns it into a project folder (see ../kit.ts).
// These functions only work out what goes into the new project's files.

const language = z.string().regex(/^[a-z]{2}$/, "a two-letter language code, the name of a folder in languages/");
const perLanguage = z.record(language, z.string().min(1));
const key = z.string().regex(/^[a-z][a-z0-9_]*$/, "a short name in lower case with no spaces, for example first_visit");
const hex = z.string().regex(/^#[0-9a-f]{6}$/, "a colour as #rrggbb in lower case");
const range = z
  .string()
  .regex(/^(closed|\d{2}:\d{2}-\d{2}:\d{2})$/, 'opening hours as "09:00-17:00", or "closed"');

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const blueprintSchema = z
  .strictObject({
    /** The project's folder name, in camelCase like the other stacks (safaClinic, bookingKit). */
    folder: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "a folder name in camelCase, letters and digits only"),
    /** The business name per language. */
    name: perLanguage,
    /** What kind of business it is, in a few words, for the starting prompt. */
    business: z.string().min(1),
    languages: z.strictObject({ default: language, others: z.array(language).default([]) }),
    /** The extensions that are on. The others stay in the code, switched off. */
    extensions: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
    mark: z.enum(BRAND_MARKS).default("sparkle"),
    /** Any part of client.json's `theme`; what is left out stays as the kit has it. */
    theme: z
      .strictObject({
        fonts: z.record(z.string(), z.unknown()),
        colors: z.record(z.string(), hex),
        radius: z.record(z.string(), z.string()),
        shadows: z.record(z.string(), z.string()),
        appIcon: z.record(z.string(), hex),
      })
      .partial()
      .default({}),
    /** Wording of this client's own, per language: replaces the same keys of the language pack. */
    wording: z.record(language, z.record(z.string(), z.string())).default({}),
    services: z
      .array(
        z.strictObject({
          key,
          name: perLanguage,
          /** What the service includes, shown under its name. */
          includes: perLanguage.optional(),
          minutes: z.number().int().positive(),
          /** "From" price in shekels. */
          price: z.number().nonnegative(),
          /** False for a service only the owner can book. */
          online: z.boolean().default(true),
        }),
      )
      .optional(),
    products: z
      .array(z.strictObject({ key, name: perLanguage, description: perLanguage.optional(), price: z.number().nonnegative() }))
      .optional(),
    /** Opening hours of each day of the week. */
    hours: z.strictObject(Object.fromEntries(DAYS.map((day) => [day, range])) as Record<(typeof DAYS)[number], typeof range>).optional(),
    /** The host port of the project's own local Postgres. */
    postgresPort: z.number().int().min(1024).max(65535),
    /** What the client asked for that the kit may not do yet, one wish per line. */
    wishes: z.array(z.string().min(1)).default([]),
  })
  .refine((blueprint) => !blueprint.languages.others.includes(blueprint.languages.default), {
    message: "the default language must not also be listed in others",
    path: ["languages", "others"],
  })
  .refine((blueprint) => blueprint.languages.default in blueprint.name, {
    message: "the name is needed in the default language",
    path: ["name"],
  });

export type Blueprint = z.infer<typeof blueprintSchema>;

export const languagesOf = (blueprint: Blueprint): string[] => [blueprint.languages.default, ...blueprint.languages.others];

/**
 * What a blueprint asks for that cannot be done, in plain words; empty when
 * it is fine. `packs` and `extensions` are the folders the kit has.
 */
export function problems(blueprint: Blueprint, kit: { packs: string[]; extensions: string[] }): string[] {
  const found: string[] = [];
  for (const code of languagesOf(blueprint)) {
    if (!kit.packs.includes(code))
      found.push(`There is no language pack "${code}" (languages/${code}/). The kit has: ${kit.packs.join(", ")}. Add the pack to the kit first.`);
  }
  for (const id of blueprint.extensions) {
    if (!kit.extensions.includes(id)) found.push(`There is no extension "${id}". The kit has: ${kit.extensions.join(", ")}.`);
  }
  const pets = blueprint.extensions.includes("pets");
  if (pets && (blueprint.services || blueprint.products))
    found.push("With the pets extension on, leave `services` and `products` out: its rules choose among the kit's grooming services.");
  if (!pets && !blueprint.services?.length) found.push("List at least one service under `services`.");
  if (blueprint.extensions.includes("dibs-import") && !pets) found.push("The dibs-import extension belongs to a grooming client that also has pets on.");
  const keys = (blueprint.services ?? []).map((service) => service.key);
  for (const duplicate of new Set(keys.filter((item, index) => keys.indexOf(item) !== index))) found.push(`Two services are called "${duplicate}".`);
  const productKeys = (blueprint.products ?? []).map((product) => product.key);
  for (const duplicate of new Set(productKeys.filter((item, index) => productKeys.indexOf(item) !== index)))
    found.push(`Two products are called "${duplicate}".`);
  const main = blueprint.languages.default;
  for (const service of blueprint.services ?? []) {
    if (!service.name[main]) found.push(`Service "${service.key}" has no name in ${main}, the site's default language.`);
    if ((service.name[main] ?? "").length > 80) found.push(`Service "${service.key}": the name is longer than 80 characters.`);
  }
  for (const product of blueprint.products ?? []) {
    if (!product.name[main]) found.push(`Product "${product.key}" has no name in ${main}, the site's default language.`);
  }
  for (const day of DAYS) {
    const value = blueprint.hours?.[day];
    if (value && value !== "closed") {
      const [opens, closes] = value.split("-") as [string, string];
      if (opens >= closes) found.push(`Hours of ${day}: ${opens} is not before ${closes}.`);
    }
  }
  return found;
}

/** The new project's client.json: the kit's theme with the blueprint's changes over it, and none of the kit's own wording. */
export function clientFrom(blueprint: Blueprint, kit: Client): Client {
  const theme = blueprint.theme;
  return {
    languages: { default: blueprint.languages.default, others: blueprint.languages.others },
    extensions: blueprint.extensions,
    brand: {
      name: Object.fromEntries(languagesOf(blueprint).map((code) => [code, blueprint.name[code] ?? blueprint.name[blueprint.languages.default]!])),
      mark: blueprint.mark,
      messages: Object.fromEntries(languagesOf(blueprint).map((code) => [code, blueprint.wording[code] ?? {}])),
    },
    theme: {
      fonts: { ...kit.theme.fonts, ...(theme.fonts as Partial<Client["theme"]["fonts"]> | undefined) },
      colors: { ...kit.theme.colors, ...(theme.colors as Partial<Client["theme"]["colors"]> | undefined) },
      radius: { ...kit.theme.radius, ...(theme.radius as Partial<Client["theme"]["radius"]> | undefined) },
      shadows: { ...kit.theme.shadows, ...(theme.shadows as Partial<Client["theme"]["shadows"]> | undefined) },
      appIcon: { ...kit.theme.appIcon, ...(theme.appIcon as Partial<Client["theme"]["appIcon"]> | undefined) },
    },
  };
}

type Seed = {
  services: { key: string; duration_min: number; price_from_agorot: number; bookable_online: boolean }[];
  products: { key: string; price_agorot: number }[];
  opening_hours: { weekday: number; opens: string | null; closes: string | null; closed: boolean }[];
  message_templates: unknown[];
};

/** db/seed/data.json for the new project: the blueprint's services, products and hours; the message templates stay. */
export function seedFrom(blueprint: Blueprint, kit: Seed): Seed {
  if (!blueprint.services) return blueprint.hours ? { ...kit, opening_hours: hoursFrom(blueprint.hours) } : kit;
  return {
    services: blueprint.services.map((service) => ({
      key: service.key,
      duration_min: service.minutes,
      price_from_agorot: Math.round(service.price * 100),
      bookable_online: service.online,
    })),
    products: (blueprint.products ?? []).map((product) => ({ key: product.key, price_agorot: Math.round(product.price * 100) })),
    opening_hours: blueprint.hours ? hoursFrom(blueprint.hours) : kit.opening_hours,
    message_templates: kit.message_templates,
  };
}

function hoursFrom(hours: NonNullable<Blueprint["hours"]>): Seed["opening_hours"] {
  return DAYS.map((day, weekday) => {
    const value = hours[day];
    if (value === "closed") return { weekday, opens: null, closes: null, closed: true };
    const [opens, closes] = value.split("-") as [string, string];
    return { weekday, opens, closes, closed: false };
  });
}

type Content = Record<string, Record<string, Record<string, string>>>;

/**
 * One language pack's content.json for the new project: the blueprint's
 * services and products in that language. Where the blueprint has no text in
 * the language, the default language's text stands in, and `borrowed` lists
 * it so the starting prompt can ask for the translation.
 */
export function contentFrom(blueprint: Blueprint, code: string, kit: Content): { content: Content; borrowed: string[] } {
  if (!blueprint.services) return { content: kit, borrowed: [] };
  const main = blueprint.languages.default;
  const borrowed: string[] = [];
  const text = (entity: string, item: string, field: string, value: Record<string, string> | undefined): Record<string, string> => {
    if (!value) return {};
    if (value[code]) return { [field]: value[code] };
    if (!value[main]) return {};
    borrowed.push(`${entity}.${item}.${field}`);
    return { [field]: value[main] };
  };
  const service = Object.fromEntries(
    blueprint.services.map((item) => [item.key, { ...text("service", item.key, "name", item.name), ...text("service", item.key, "includes", item.includes) }]),
  );
  const product = Object.fromEntries(
    (blueprint.products ?? []).map((item) => [
      item.key,
      { ...text("product", item.key, "name", item.name), ...text("product", item.key, "description", item.description) },
    ]),
  );
  return { content: { ...kit, service, product }, borrowed };
}

/** INITIAL_PROMPT.md: what the first working session in the new project is told. */
export function initialPrompt(
  blueprint: Blueprint,
  facts: {
    /** Every extension the kit has, with a line about each. */
    extensions: { id: string; about: string }[];
    /** Per language, the starting content that stands in the default language. */
    borrowed: Record<string, string[]>;
    /** True when the blueprint changed no colour. */
    kitColours: boolean;
    kitCommit: string;
    date: string;
  },
): string {
  const main = blueprint.languages.default;
  const name = blueprint.name[main]!;
  const on = facts.extensions.filter((extension) => blueprint.extensions.includes(extension.id));
  const off = facts.extensions.filter((extension) => !blueprint.extensions.includes(extension.id));
  const list = (items: string[]) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- (none)");
  const borrowed = Object.entries(facts.borrowed).filter(([, items]) => items.length > 0);
  const todo: string[] = [];
  if (borrowed.length)
    todo.push(
      `Translate the starting content that still stands in ${main}: ${borrowed
        .map(([code, items]) => `\`languages/${code}/content.json\` (${items.join(", ")})`)
        .join("; ")}. Then run \`pnpm brand\` and \`pnpm lang:check\`.`,
    );
  todo.push(
    "Read the site's wording as this business's customer would. The packs were written for a grooming salon first and made neutral later; anything that does not fit this business is replaced under `brand.messages` in `client.json` (the key, then the new text, per language), not in the packs.",
  );
  if (facts.kitColours)
    todo.push(
      "The colours, fonts and corner rounding are still the kit's. Set this client's under `theme` in `client.json`, run `pnpm brand`, and keep every text pair at 4.5:1 (`tests/unit/brand.test.ts` checks the main ones).",
    );
  todo.push(
    "The privacy notice (`src/views/pages/site/privacy.tsx`) is a draft written for a salon in Israel. Check it against what this business collects and have the owner's lawyer read it before the site is live.",
    "Ask the owner which providers she uses for messages and email (`MESSAGING_DRIVER`, `EMAIL_DRIVER`, see README, Notifications) and for photo storage. Do not choose one, and never run the fake providers live. The message templates in the seed need approving at her messaging provider under her own account.",
    "The owner's account is made by a person, not by an agent: `pnpm staff:create <email>` prints a key for her authenticator app.",
    `Add this project to the stack registry and the ports list in \`~/Containers/CLAUDE.md\` (folder \`${blueprint.folder}/\`, compose file \`docker/compose.dev.yml\`, project \`${blueprint.folder.toLowerCase()}\`, Postgres on host port ${blueprint.postgresPort}).`,
  );
  return `# Starting prompt: ${name}

This project was made from bookingKit (commit \`${facts.kitCommit}\`) on ${facts.date} by \`pnpm kit new\`, from the blueprint kept here as \`blueprint.yaml\`. Give this file to the first working session in this folder. Read \`CLAUDE.md\` first: its rules apply to everything below.

## The client

- Name: ${Object.entries(blueprint.name)
    .map(([code, value]) => `${value} (${code})`)
    .join(", ")}
- Business: ${blueprint.business}
- Languages: ${main} is the default; ${blueprint.languages.others.length ? blueprint.languages.others.join(", ") + " under their own prefix" : "no other language"}

## What is already set up

- \`client.json\` holds the name, the languages, the extensions that are on and the look. The files generated from it are up to date.
- The starting content (services, products, opening hours) is in \`db/seed/data.json\` and each language's \`languages/<code>/content.json\`. \`pnpm seed\` puts it in the database; the owner changes it afterwards in her own area.
- The local database is its own: compose project \`${blueprint.folder.toLowerCase()}\`, Postgres on host port ${blueprint.postgresPort}.
- Nothing is installed and no database exists yet. To start:

\`\`\`sh
pnpm install
cp env.example .env.local        # then fill in APP_BASE_URL, SESSION_SECRET and DATABASE_URL (port ${blueprint.postgresPort})
docker compose -f docker/compose.dev.yml up -d
pnpm migrate && pnpm seed
pnpm typecheck && pnpm lint && pnpm lang:check && pnpm test
pnpm exec playwright install chromium   # once
pnpm test:e2e
\`\`\`

  Everything should pass before any change is made. If something fails, fix that first and say what it was.

## Extensions

On for this client:

${list(on.map((extension) => `\`${extension.id}\`: ${extension.about}`))}

Off (they stay in the code; switching one on is a line in \`client.json\` and \`pnpm brand\`):

${list(off.map((extension) => `\`${extension.id}\`: ${extension.about}`))}

## What the client wishes for

${list(blueprint.wishes)}

For each wish, in this order:

1. Check whether the system already does it: a setting in the owner's area, or an extension that is off.
2. If not, it is this client's customisation: build it as an extension of its own under \`extensions/<id>/\` (copy the shape of a small one such as \`extensions/map-links/\` or \`extensions/split-hours/\`), switch it on in \`client.json\`, and give it tests. Never an \`if\` in the core.
3. If the core has no place for the extension to hook into, add a point to \`src/extension/types.ts\` or \`src/extension/views.ts\` that any client could use, and say so in \`docs/build-notes.md\`: it is a candidate to take back to the kit.
4. Ask the owner before anything that costs money, picks a provider, or changes how booking works for her customers.

## To do before the site is shown to the owner

${todo.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Updates from the kit

This project shares the kit's history. When the kit improves, \`pnpm kit update\` here merges its changes in, keeps this client's own files, and says what to run next (new database changes, the checks). Because of that:

- What only this client needs lives in its own places: \`client.json\`, an extension of its own under \`extensions/\`, a view of its own in \`theme/views.ts\`. Those never meet a kit change.
- Change the core (\`src/core\`, \`src/views\`, the kit's extensions) here only when there is no other way, and note it in \`docs/build-notes.md\`: the same change belongs in the kit, and until it is there every update may stop on those lines.
- After an update, run the whole suite before releasing.

## Rules that are easy to break

- No secrets, real phone numbers or customer data in code, tests, logs or commits. Filled-in \`.env\` files are never committed.
- The working session never holds production keys and never connects to the live server or database. Releases go through CI.
- Migrations are plain SQL, additive first, and never run when the app starts.
- Every message goes through \`Notify\`. AI never blocks or changes a booking.
- Finish each stage with the tests passing and a short note in \`docs/build-notes.md\`.
`;
}
