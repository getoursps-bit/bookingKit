# bookingKit, step 2: the translation module and feature modules

Status: draft for approval. Nothing here is built yet.

## Context

Step 1 put the brand in `client.json`. Two things still make the kit one
client's:

- **Languages are written into the code.** Hebrew and English are named in
  about 40 places (`src/i18n/locales.ts`, `format.ts`, the proxy, emails, the
  calendar), and each owner text has an `_en` column. Safa added Arabic by
  editing about 55 files and adding an `_ar` column to every table, and still
  missed two places (emails and the calendar render Arabic left to right).
- **Features are all-or-nothing.** Pets, gallery, products and the rest are
  always on. Safa removed the pet features by deleting them.

Step 2 makes both a setting in `client.json`:

```json
{
  "languages": { "default": "he", "others": ["en"] },
  "modules": { "pets": true, "gallery": true, "products": true, "…": true }
}
```

Two rules from the owner of this kit:

- A module that is switched off stays in the code. Nothing is deleted.
- Use well-known libraries where they exist instead of hand-written code.

## Part A: the translation module

Language is one module, `translation`, that owns language at both levels and
is always present. It works the same for a client with one language (no
language switch, no address prefixes, empty translation table) and for a
client with several.

| Level | What it is | Where it lives | Like |
|---|---|---|---|
| 1. Strings | The system's own text: buttons, labels, messages, errors | A language file per language, in the code | Laravel's `lang/` files, WordPress localisation |
| 2. Content | What the business enters: services, products, photo texts, tagline, message templates | The database | A translation plugin's table |

No other module knows how translation is stored. A module only **declares**
which of its strings and which of its content fields can be translated; the
translation module does the rest.

### Level 1: strings, with next-intl

The hand-written translator, the language routing in the proxy, the link
helper and the formatting code are replaced by **next-intl** (free, MIT,
version 4 supports Next.js 16). Its core, `use-intl`, runs outside React, so
the worker's messages use the same strings.

| Today (hand-written) | With next-intl |
|---|---|
| `translator()`, `getI18n()`, `useI18n()` in `src/i18n` | `getTranslations()` / `useTranslations()`; `createTranslator()` in the worker |
| Language prefix handling in `src/proxy.ts` and `locales.ts` (`localePath`, `splitLocale`) | Its routing: the default language at plain addresses, others under `/<code>`, as now |
| `lp()` for links | Its `Link` and `getPathname` |
| `formatPrice`, `formatDuration`, date formats per language | Its formatter, built on the browser's `Intl`; plurals written in the strings in ICU syntax |
| `dirOf()` with a hard-coded list | Direction from the language pack |
| Missing-key check in `tests/unit/t.test.ts` | Its typed keys, plus the same parity test over every pack |

What stays ours, because the library does not do it:

- `isolate()`: wrapping numbers, prices and phone numbers so they keep their
  direction inside Hebrew or Arabic text. A thin wrapper applies it to every
  value passed into a string, as today.
- The client's own wording from `client.json`, laid over the pack.
- The owner area following the language cookie instead of the address.

Changes this forces:

- The string files change shape, from flat keys (`"home.heroTitle"`) to
  nested ones, because the library reads a dot as nesting. A script converts
  them; the 480 call sites keep the same key text. Two keys are both a string
  and a group (`settings.booking`, `admin.nav`) and get renamed.
- Two strings contain an apostrophe or a tag and need escaping for ICU.

### Level 2: content, in one table

Today each owner text has a Hebrew column and an `_en` column, and `pick()`
chooses. Safa added an `_ar` column to every table for a third language.

Change: the translation module owns one table, and no other table gets
language columns again.

```text
content_translations
  entity     text    -- "service", "product", "gallery_image", "profile", "message_template"
  entity_id  bigint
  field      text    -- "name", "description", "body", …
  locale     text    -- "en", "ar"
  value      text
  primary key (entity, entity_id, field, locale)
```

- The text in the client's default language stays in the existing main
  column, so a one-language client never touches this table.
- Migration: create the table and copy the `_en` values into it. The `_en`
  columns stay until a later release (additive first).
- Reading: `translated(rows, entity, locale)` fills a list of rows with their
  translations in one query; a missing translation shows the default
  language, as `pick()` does now.
- The owner area shows one field per language the client has switched on,
  not a fixed "English" field, and saves through the module.
- Customers get messages in the language they booked in, as now.

### The language pack

One folder per language, `languages/<code>/`:

| File | Level | Holds |
|---|---|---|
| `pack.json` | | The language's own name, its direction, the formatting locale (`he-IL`, `ar-IL`, `en-IL`) and the font it needs, if any |
| `messages.json` | 1 | Every system string |
| `content.json` | 2 | Translations of the starting content (services, products, templates), which `pnpm seed` writes into `content_translations` |
| `legal/privacy.md`, `legal/accessibility.md` | 1 | The two legal pages, which are long text |

Adding a language to a client: put its code in `client.json`. Adding a
language to the kit: add a folder. No code change and no migration in either
case.

The kit ships Hebrew, English and Arabic. Arabic starts from Safa's file,
which already has 441 of the kit's 533 strings.

### The contract: how a person or an AI fills a pack

`pnpm lang:contract` writes `languages/contract.json`, a description of
everything that can be translated, built from what the modules declare:

```json
{
  "strings": {
    "home.firstFree": { "source": "התור הפנוי הקרוב: {when}", "placeholders": ["when"], "module": "core", "note": "Button on the home page" }
  },
  "content": {
    "service": { "key": "key", "fields": { "name": { "max": 80 }, "includes": { "max": 300 } }, "module": "core" },
    "message_template": { "key": "key:channel", "fields": { "body": { "keepPlaceholders": true }, "subject": {} } }
  }
}
```

It is the single description an AI (or a translator) needs. Given the
contract and a language code, it writes two files and nothing else:
`messages.json` for the strings and `content.json` for the content. It never
has to know table names, columns or where a string is used.

`pnpm lang:check` then checks every pack against the contract: every string
present, the same placeholders, every content entry pointing at a real field,
lengths within limits. It lists what is missing. `pnpm seed` puts the content
translations in the database.

Translating is therefore done by whoever sets up the client (the starting
prompt from `kit new` will say "fill the pack for `<code>` from the
contract"), and checked by a command. The live site calls no translation
service and needs no key for it.

## Part B: modules

### What a module is

A named feature that can be switched off without removing code. One registry
file, `src/modules.ts`, lists each module:

- its key, a one-line description (shown later by `kit new` as a tick list);
- the modules it needs (for example `petPhotos` needs `pets`);
- the outside service it needs, if any (WhatsApp, storage, AI).

`getFeatures()` (`src/server/features.ts`) already answers "is this on?" for
every page and route, from which services have keys. It gains the module
switches: a feature is on when its module is on **and** its service is
configured. The 16 existing call sites do not change.

Switched off means, for every module:

- its pages answer "not found" and leave the menus and the sitemap;
- its owner-area screens and settings are hidden;
- its API routes refuse;
- its worker jobs skip;
- its strings, tables and code stay where they are.

The database is the same for every client: all migrations always run. A
switched-off module has empty tables. This keeps one schema to test and makes
switching a module on later a one-line change.

### The modules

| Module | Covers | Notes |
|---|---|---|
| `translation` | Languages at both levels (Part A) | Always present; one language or several |
| `pets` | Pet details in booking, species and size rules that pick the service, vet and vaccine fields, pets on the customer page and calendar | The hard one: it is inside the booking steps. Off = the customer picks services directly and can leave a note, as Safa works |
| `petPhotos` | Photo upload in booking and the AI look at it | Needs `pets`, storage, AI |
| `multiBooking` | Several pets or services in one booking | Replaces the constant `MULTI_PET_BOOKING` |
| `gallery` | Gallery page, home section, owner upload | Needs storage |
| `products` | Products page, home section, WhatsApp ordering | |
| `landingPages` | Campaign pages under `/l/` | |
| `installApp` | Install prompt and home button | |
| `emailLogin` | Owner login by a code sent by email | Needs email |
| `aiHelp` | Message summaries and auto-reply | Needs AI |
| `dibsImport` | The one-time import from Dibs | A script, not a page |
| `approval` | Bookings wait for the owner's yes | From Safa |
| `splitHours` | Two opening periods in a day | From Safa |
| `logoUpload` | Owner uploads the logo and cover | From Safa (cover is already here) |
| `contactIcons` | Waze, Google Maps and Apple Maps buttons | From Safa |

Core, never switched off: booking, free times, the no-overlap rule,
verification codes, private links, the message outbox, reminders, the owner
area, hours, settings, both app manifests.

### Icons and wording that follow a module

The paws next to a pet's name and the scissors on service cards belong to
`pets`. With `pets` off the service cards use the brand mark. Pet wording
(`pets.*`, `coat.*`, the home page's "dogs and cats" lines) moves from the
shared strings into the pets module's own strings, so a client without pets
never ships them.

### Testing two shapes of client

`client.json` is read when the site is built, so a second client is tested
by building with it. `scripts/with-client.sh <file> <command>` puts another
client file in place, runs the command and puts the committed one back. CI
runs the whole check twice:

- the default client: Hebrew and English, every module on (today's suite);
- the sample client: as its languages and modules are added, Arabic first
  with Hebrew, and `pets` and `products` off.

Tests that only make sense for one shape read `client.json` and skip
themselves otherwise. Unit tests check each module off alone: its pages
answer "not found" and the menus stay valid.

## Other places a library replaces hand-written code

| Area | Library | When |
|---|---|---|
| Interface strings, routing, formatting | next-intl | This step |
| Phone numbers (`+972` handling in `src/server/links.ts`) | libphonenumber-js | This step, only if a client outside Israel is expected; otherwise later |
| Questions and tick lists in `kit new` | @clack/prompts | Step 3 |
| Reading the blueprint file | yaml | Step 3 |
| Copying the template into a new folder | giget, or plain `git clone` | Step 3 |

Already libraries, no change: zod (checks), date-fns (time zone), sharp
(photos), FullCalendar (owner calendar), Tailwind (styles), Playwright and
axe (tests).

Stays hand-written on purpose: the booking engine, the no-overlap rule and
the message outbox. They are the product.

## Order of work

1. **The translation module** (about 5 to 7 days)
   1. The two-client test run (`scripts/with-client.sh`, CI matrix).
   2. next-intl in place of the hand-written translator, formatting and
      routing, with Hebrew and English only. Page pictures must not change.
   3. Packs as folders; `languages` in `client.json`; direction, fonts and
      formats from the pack; the hard-coded language checks removed.
   4. `content_translations`, `translated()`, and the owner area's
      per-language fields.
   5. The contract, `pnpm lang:contract` and `pnpm lang:check`.
   6. The Arabic pack, filled from the contract, and the sample client
      switched to Arabic first.
2. **Modules** (about 1 to 2 weeks)
   1. The registry, `modules` in `client.json`, `getFeatures()`.
   2. The simple modules: gallery, products, landing pages, install, email
      login, AI help.
   3. `pets`, `petPhotos`, `multiBooking`.
   4. Safa's four, brought over as modules.

Each sub-step ends with tests passing, the page pictures of the default
client unchanged, and a note in `docs/build-notes.md`.

## Not in this step

- The `kit new` command and the blueprint (step 3).
- Moving Fluffy Fur or Safa onto the kit.
- Layout variants (a different home page per client).
- Translating the owner's own text automatically on the live site. The
  owner types each language herself, or it is seeded from a pack.

## Decided

- Language is one module covering system strings and database content, for
  one language or several (2026-11-09).
- System strings use a library (next-intl), like Laravel's translation files
  or WordPress localisation.
- An AI or a person fills a language from a contract that describes the
  strings and the content; it writes a language file and content that is
  seeded into the database. No translation service runs on the live site.
