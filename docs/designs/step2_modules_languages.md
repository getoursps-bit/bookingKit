# bookingKit, step 2: core, views, extensions and translation

Status: draft for approval. Nothing here is built yet.

## Context

The kit is a booking system with a website merged into it. Step 1 put the
brand in `client.json`. What still makes the kit one client's is that the
system and one client's customisation are mixed in the same files:

- **Fluffy Fur's customisation** (pets: species and size rules, vet and
  vaccine fields, pet photos) sits inside the booking steps, the calendar and
  the customer page.
- **Safa's customisation** (bookings the owner approves, two opening periods
  a day) was made by editing the same core files in a copy, after deleting
  the pet parts.
- **Languages** are written into the code in about 40 places, and each owner
  text has an `_en` column. Safa added Arabic by editing about 55 files.

Pets and Safa's changes are not features of the system. They are clients'
customisations. The system itself has three layers, and a customisation is a
fourth thing added on top:

```text
┌──────────────────────────────────────────────────────────────┐
│ Extensions   a client's customisation: pets, approval, …     │
├──────────────────────────────────────────────────────────────┤
│ Views        pages and screens; customisable per client      │
├──────────────────────────────────────────────────────────────┤
│ Core         booking  │  website  │  platform                │
│              what makes it a booking system and a website    │
└──────────────────────────────────────────────────────────────┘
```

- **Core** never contains a client's idea. It is the same for every client.
- **Views** show core data, trigger core actions and react to core events.
  A client can restyle or replace a view without touching the core.
- **Extensions** add to the core or the views through fixed extension
  points. An extension that a client does not use is not switched on; its
  code stays in place and is never deleted.

Rule from the owner of this kit: use well-known libraries where they exist
instead of hand-written code.

## Part A: the translation module

Language is one module, `translation`, that owns language at both levels and
is always present. It works the same for a client with one language (no
language switch, no address prefixes, empty translation table) and for a
client with several.

| Level | What it is | Where it lives | Like |
|---|---|---|---|
| 1. Strings | The system's own text: buttons, labels, messages, errors | A language file per language, in the code | Laravel's `lang/` files, WordPress localisation |
| 2. Content | What the business enters: services, products, photo texts, tagline, message templates | The database | A translation plugin's table |

Nothing else knows how translation is stored. A core module or an extension
only **declares** which of its strings and content fields can be translated;
the translation module does the rest.

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
everything that can be translated, built from what the core modules and extensions declare:

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

## Part B: core, views and extensions

### Core

Three core modules. Each one has its entities (data), its actions (what can
be done) and its events (what it announces). Nothing outside a core module
reads its tables directly.

| Core module | What makes it what it is | Entities | Actions | Events |
|---|---|---|---|---|
| **Booking** | A booking system: someone offers services at times, and customers book them | Service, opening hours, time off, customer, appointment and its lines, hold, manage link | Find free times, hold, book, move, cancel, mark done or no-show | Booked, moved, cancelled, reminder due |
| **Website** | A website: pages about the business that visitors read | Business profile, page, gallery photo, catalogue item (product), landing page, menu | Edit content, upload a photo, publish | Content changed |
| **Platform** | What both need | Staff and sessions, settings, message outbox and templates, translations, theme, stored files | Log in, send a message, translate, store a file | Message sent or failed, reply received |

Notes on the boundaries:

- An appointment has **lines**: one service each, with an optional label and
  note. The core does not know what a line is "for". (Fluffy Fur's pet and
  Safa's treatment area are both this.)
- Messaging is platform: every message still goes through the outbox and
  `route()`. Booking raises "booked"; platform decides the channel.
- The gallery, the catalogue and the install-as-app prompt are plain website
  parts. A client that has no photos or products simply has none; the pages
  and menu entries hide when empty, as Safa's products already do.
- The translation module (Part A) and the theme (step 1) are platform.
- AI help, WhatsApp, email, push and storage are outside services behind
  platform interfaces, on when their keys are set, as today.

### Views

The view layer is every page and owner-area screen. A view:

- gets its data from core entities through read functions, never from SQL;
- triggers core actions (forms and buttons post to them);
- shows what core events produced (alerts, the inbox, notices).

How it is made customisable:

- Route files in `src/app` become thin: load data from the core, render a
  named view. The views themselves live in `src/views/`.
- A client replaces a view by listing its own in `theme/views.ts`
  (`{ "home": MyHome }`). Anything not listed uses the kit's view. Colours,
  fonts and rounding already come from `client.json`.
- Views have **slots**: named places where an extension can add something,
  for example "booking: details of each line", "calendar: under the
  customer's name", "customer page: panels".

This is what lets a client look different (Safa's phone-width column and
treatment picker) without a fork of the core.

### Extensions

An extension is a folder, `extensions/<name>/`, with one manifest that says
what it adds. It can use only these extension points:

| Extension point | What it lets an extension do | First real use |
|---|---|---|
| Extra fields | Add fields to an appointment line, a customer or a service, with their form inputs and checks | Pets: species, size, age, coat, vet, vaccines |
| Booking steps | Add a step to the booking flow, or content to a step's slot | Pets: "tell us about your pet" |
| Service rules | Suggest or limit services from what the customer entered | Pets: species and size choose the service |
| Booking hooks | Run before or after a core action and change its outcome within set limits | Approval: a new booking waits for the owner's yes |
| Availability rules | Change which times are free | Split hours: two opening periods a day |
| View slots | Add UI in a named slot | Pets on the calendar and customer page |
| Owner screens | Add a screen or a settings group to the owner area | Pets: the rules editor |
| Messages | Add message kinds and templates | Approval: "your request was accepted" |
| Own tables | Its own migrations, in tables with its own prefix | `ext_pets_*` |
| Translations | Declare its strings and content fields in the contract (Part A) | All |

`client.json` lists which extensions are on:

```json
{ "extensions": ["pets", "pet-photos"] }
```

- Off means not registered: no steps, no fields, no screens. Its code and
  tables stay. Migrations of every extension in the kit always run, so there
  is one database shape to test.
- An extension never edits a core file. If it needs something the points do
  not offer, the core gets a new extension point, not a client `if`.
- AI never blocks or changes a booking; an extension cannot override that or
  the no-overlap rule.

Where extensions live:

- **In the kit:** ones worth sharing. To start: `pets` and `pet-photos`
  (taken out of today's code), `approval` and `split-hours` (from Safa),
  `dibs-import` (the one-time import tool).
- **In a client's repo:** ones only that client needs, in the same
  `extensions/` folder shape.

Because a client's changes are confined to `client.json`, `theme/`, and
`extensions/`, a client repo can take kit updates by merging, instead of
re-doing the same feature in two places.

### How the extension points get designed

Not by guessing. The two existing clients are the specification:

1. Take pets out of the core into an extension. Every place the core had to
   know about pets becomes an extension point. When Fluffy Fur's whole test
   suite passes with pets as an extension, the points are right for it.
2. Rebuild Safa's approval and split hours as extensions on the same core.
   Where they do not fit, the points are adjusted.
3. A third client then starts from points that two real clients have used.

### Testing two shapes of client

`client.json` is read when the site is built, so a second client is tested
by building with it. `scripts/with-client.sh <file> <command>` puts another
client file in place, runs the command and puts the committed one back. CI
runs the whole check twice:

- the default client: Hebrew and English, `pets` and `pet-photos` on
  (today's suite);
- the sample client: Arabic first with Hebrew, no extensions, then with
  `approval` and `split-hours`.

A core test never mentions an extension. Each extension has its own tests,
which skip themselves when it is off.

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
2. **Core boundaries** (about 1 week)
   1. Booking, website and platform as three folders with read functions,
      actions and events; no SQL outside them.
   2. Appointment lines without pets in the core's own vocabulary.
3. **Views** (about 1 week)
   1. Thin routes; views in `src/views/`; `theme/views.ts` overrides.
   2. Slots where the first extensions need them.
4. **Extensions** (about 2 weeks)
   1. The extension manifest and loader; `extensions` in `client.json`.
   2. `pets` and `pet-photos` taken out of the core. The default client's
      tests and page pictures must not change.
   3. `approval` and `split-hours` rebuilt from Safa.
   4. `dibs-import`.

Each sub-step ends with tests passing, the page pictures of the default
client unchanged, and a note in `docs/build-notes.md`.

## Not in this step

- The `kit new` command and the blueprint (step 3).
- Moving Fluffy Fur or Safa onto the kit.
- Layout variants (a different home page per client).
- Translating the owner's own text automatically on the live site. The
  owner types each language herself, or it is seeded from a pack.

## Decided

- The system is core (booking, website, platform), views, and extensions.
  Pets and Safa's changes are clients' customisations, built as extensions;
  they are not part of the system (2026-11-09).
- Language is one platform module covering system strings and database
  content, for one language or several (2026-11-09).
- System strings use a library (next-intl), like Laravel's translation files
  or WordPress localisation.
- An AI or a person fills a language from a contract that describes the
  strings and the content; it writes a language file and content that is
  seeded into the database. No translation service runs on the live site.
