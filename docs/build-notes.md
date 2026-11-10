# Build notes

Notes for the kit itself. Fluffy Fur's notes, from the system this started as,
are in [`reference/fluffy_fur_build_notes.md`](reference/fluffy_fur_build_notes.md).

## Step 1: the brand in one file

Design: [`designs/step1_brand.md`](designs/step1_brand.md).

### 0. The repo (2026-11-09)

- A clean copy of Fluffy Fur's tracked files at `8bd7e5e`, with a new history.
- Fluffy Fur's design, brief, concepts and build notes moved to
  `docs/reference/`; its release notes and review reports were dropped.
- Its own compose project (`bookingkit`) and ports, so it runs next to the
  client projects: Postgres 5435, end-to-end tests 3600.
- CI names the image after the repository, in lower case.
- `tests/e2e/visual.spec.ts` takes a picture of each public page in both
  languages at phone and wide widths. It runs only with `VISUAL=1` and the
  pictures are not committed.

### 1–7. The brand file (2026-11-09)

**Built**

- `client.json` holds the name (Hebrew and English), the brand mark, the
  client's own wording, fonts, 29 palette colours, five corner radii, three
  shadows and the app icon colours. `src/brand.schema.ts` describes and checks
  it; `src/brand.ts` is what the code imports.
- `pnpm brand` (`scripts/brand-css.ts`) writes `src/app/brand.css` from it.
  The file is committed; `globals.css` imports it after Tailwind and keeps
  only the status colours, which are the same for every client.
- The manifests, theme colour, app icon, fallback name, email subject and the
  authenticator app name read the brand. The icon shown for a missing logo or
  photo is the brand mark.
- The language files say `{brand}` where the name goes; `src/i18n/t.ts` lays
  the client's wording over them once, for pages, browser code and the worker.
- The seed text says `%BRAND%` and `seed()` fills it in.
- Neutral names: cookies `bk_*`, calendar classes `cal-*`, log tag
  `APP_SERVICE`, WhatsApp templates `booking_*`, schema from `DB_SCHEMA`
  (default `app`, local role `app_user`).

**Verified**

- After each of the six code steps, the 40 page pictures (20 pages, phone and
  wide) matched the starting look with no pixel changed, and the five app
  icons are byte-identical to Fluffy Fur's.
- `pnpm test`: 206 tests. `pnpm test:e2e`: 61 pass, including axe on every
  page in both languages.
- Swap proof: with `tests/fixtures/client.sample.json` in place of
  `client.json` (another name, a teal palette, Heebo, the sparkle mark,
  tighter corners), the unit tests and all 61 browser tests pass, and neither
  the build output nor a freshly seeded database contains the default name or
  accent colour.
- Unit tests that stay: the palette's main text pairs reach 4.5:1 (both
  clients), `brand.css` matches `client.json`, the client's wording only
  replaces strings that exist, the seed leaves no marker behind, and no file
  in `src`, `public`, `worker`, `scripts` or `db` repeats the client's name or
  accent colour.

**Changed on purpose**

- The owner app's manifest had an older palette; it now uses the current
  accent and page colours.
- The owner calendar's selection highlight follows the accent; it had kept an
  older raspberry.

**Left for the next steps**

- The pet wording, pet icons on service cards, the hero sticker and the seed
  content (services, products such as "Fluffy Fresh", hours) are still
  Fluffy Fur's. They belong to the modules step and to per-client seed data.
- The privacy and accessibility pages are written for a grooming salon.
- Languages are still Hebrew and English in code; Arabic comes from Safa's
  work as a setting.
- A new font means adding its `@fontsource-variable` package; four are
  installed (Rubik, Fredoka, Nunito, Heebo).
- The bundled `worker/dist/migrate.js` only finds the migrations inside the
  image layout, as before.

## Step 2: core, views, extensions and translation

Design: [`designs/step2_modules_languages.md`](designs/step2_modules_languages.md).

### A1–A2. Two clients in the tests; strings through next-intl (2026-11-09)

**Built**

- `scripts/with-client.sh <file> <command>` runs a command with another
  client file in place of `client.json` and puts the committed one back. CI
  runs the whole check for the default client and the sample client.
- The interface strings are read through **next-intl** (4.14.9):
  `getI18n()` uses `getTranslations()`, `useI18n()` uses `useTranslations()`,
  and `translator()` (worker, manifests, redirects) uses `createTranslator()`
  from `use-intl/core`. The three names and every call site are unchanged.
- `src/i18n/request.ts` gives the library each request's language and
  strings; the root layout's `NextIntlClientProvider` passes them to browser
  components.
- The language files are nested (`{ "home": { "heroTitle": … } }`), as the
  library needs; keys are still written `"home.heroTitle"` and are typed.
  Two keys that were both a string and a group were renamed:
  `settings.booking` → `settings.bookingTitle`, `admin.nav` → `admin.navLabel`.
- `src/i18n` now: `t.ts` (types, `isolate`, the isolating wrapper; no
  strings), `messages.ts` (all languages with the client's wording; server
  and worker only), `translator.ts`, `keys.ts` (`isMessageKey`),
  `flatten.ts` (for tests).

**Verified**

- Every string in both languages, with and without values (2,132 outputs),
  renders to exactly the same text as before the swap.
- 206 unit tests, 61 browser tests, and the 40 page pictures unchanged.

**Decided while building**

- The language in the address stays our own proxy code; see the design for
  why the library's routing was not taken.
- The browser used to carry both languages inside its script bundle. It now
  gets the one language in use with each page (about 35 KB before
  compression). If that proves heavy, the provider can be given only the
  groups that browser components use.

### A3. Language packs (2026-11-09)

**Built**

- Each language is a folder: `languages/he/`, `languages/en/`, with
  `pack.json` (own name, direction, locales for prices, link previews and
  date names) and `messages.json`.
- `client.json` lists the languages: `{ "default": "he", "others": ["en"] }`.
  The name and the client's wording are keyed by language code; a language
  without a name of its own uses the default one.
- `pnpm brand` (`scripts/apply-client.ts`, was `brand-css.ts`) also writes
  `src/i18n/languages.generated.ts` (the list and each pack's details, safe
  for the browser) and `src/i18n/packs.generated.ts` (strings and date names
  of the client's languages only; server and worker).
- No code names Hebrew or English for system behaviour any more: addresses
  (`/<code>` for every language but the default), direction, the language
  switch (one link per other language, by its own name; none for one
  language), sitemap and link-preview alternates, email direction, price
  formats, date names, app manifests.
- Durations are plural strings in the packs (`duration.*`, ICU syntax) read
  through the library, instead of Hebrew grammar written in code.
- A font for one language is `theme.fonts.languages` in `client.json`
  (was the fixed `latin` font for English).

**Verified**

- Every string (2,120 outputs) and every duration from 0 to 600 minutes in
  both languages render exactly as before; prices too.
- 207 unit tests (also with the sample client in place), 61 browser tests,
  the 40 page pictures unchanged.

**Not yet**

- A client with one language, or without English, does not build yet: the
  owner's content still has fixed Hebrew and English fields (`pick()`, the
  `_en` columns, message templates, the catalogue forms), and the two legal
  pages have a Hebrew and an English version written in code. That is the
  next sub-step (the content translations table), and the type check now
  points at each of those places.
- The owner calendar takes its own wording from the calendar library for
  Hebrew and English only; another language gets its dates but English
  button labels until its wording is added.

### A4. Content translations (2026-11-09)

**Built**

- Migration `0014_content_translations.sql`: the translation module's table
  (`entity`, `entity_key`, `field`, `locale`, `value`), the English text
  entered so far copied into it, and the customer language check widened to
  any two-letter code. The `_en` columns stay, unread, so the previous
  version still runs on the database.
- `src/server/translation/content.ts`: `TRANSLATABLE` (what each kind of row
  can translate), `translationsColumn()` for the repositories' queries,
  `saveTranslations()` (replaces only the languages given, drops empty
  text), `dropTranslations()`, `translatedSql()` for text built in SQL, and
  `translationsFrom()` for forms, whose fields are named `name:en`.
- Services, products, gallery photos, the profile and message templates
  carry `name`, `includes`, `description`, `alt`, `caption`, `tagline`,
  `body`, `subject` in the default language plus `translations`; the old
  `nameHe`/`nameEn` pairs are gone. `pick(locale, row, "name")` replaces
  `pick(locale, he, en)`.
- The owner area shows one field per other language for each text, labelled
  in the owner's language with the other language's own name, written in
  that language's direction. A one-language site shows none.
- Messages: a customer gets the language they booked in when the template
  has wording in it (`messageLocale`), the default language otherwise.
- The seed writes English into the table, never into the old columns.
- The legal pages, the landing page text, the language switches and the
  link-preview alternates no longer assume two languages. Tests are
  type-checked by `tsconfig.tests.json`, not by `next build`: they are
  written for the kit's default client, which has Hebrew and English.

**Verified**

- The migration on a database seeded by the previous version: 6 service
  names, 8 product names, 18 message bodies carried into the table.
- 214 unit tests (7 new for the module), 61 browser tests, the 40 page
  pictures unchanged (the English pages now read the table).
- A Hebrew-only client (`languages.others: []`) builds the site and the
  worker: no `/en` addresses in the sitemap, no English in the browser
  scripts.

**Small visible change**

- In the owner area the other language's field is labelled with that
  language's own name, "שם (English)", where it said "שם (אנגלית)".

**Not yet**

- The legal pages are still written in code, in Hebrew and English; another
  language reads the default one. They are also written for a grooming
  salon, which is the extensions step's problem.
- The seed still has Hebrew content with an English overlay; a pack's
  `content.json` (A5) replaces that.
- The test suite is for a two-language client; it does not yet skip its
  English parts for a client without English.

### A5. The contract, the checker, and content in the packs (2026-11-09)

**Built**

- The seed is split: `db/seed/data.json` holds the structure (durations,
  prices, hours, rules, which templates exist, with a `key` on every row)
  and each pack's `content.json` holds the text. The seed fills the tables'
  own text columns from the site's default language and the translations
  table from every other language of the site, so an Arabic-first client
  seeds Arabic content. The seed's own language names are gone.
- `TRANSLATABLE` in the translation module now carries each field's longest
  length, and the owner-area routes read the limits from it.
- `languages/contract.json`, written by `pnpm brand` (`scripts/lang-contract.ts`):
  how to fill a pack, every string with its placeholders and the text of each
  pack in the kit, and every piece of starting content with its limit and
  placeholders. Hebrew is the reference pack.
- `pnpm lang:check [code]` (`scripts/lang-check.ts`): wrong things are
  errors (unknown keys or fields, placeholders that differ, text over its
  limit, a bad `pack.json`); strings and content a pack lacks are listed as
  missing. A unit test runs it on every pack (nothing wrong) and on the
  client's languages (nothing missing), and on a planted bad pack
  (`tests/fixtures/languages/xx`), which it must fault in seven ways.

**Verified**

- 219 unit tests, 61 browser tests, the 40 page pictures unchanged; the
  bundled `worker/dist/seed.js` runs.

### A6. The Arabic pack (2026-11-09)

**Built**

- `languages/ar/`: `pack.json` (العربية, right to left, prices in
  `ar-IL` with Latin digits, `ar` date names), `messages.json` (all 533
  strings, written from the contract in neutral plural address; Arabic
  plural forms for durations) and `content.json` (the 6 services, 8
  products and 18 message texts). `pnpm lang:check ar` reports it complete.
  The text was drafted by the AI building the kit, not by a native reader;
  the checker proves structure, not meaning.
- The Alexandria variable font (Arabic and Latin) is installed and listed in
  `FONTS`; the owner calendar has the library's Arabic wording.
- The business name is translatable like the other profile text: shown per
  language in the header, footer, page titles and legal pages, one field per
  other language in the owner area, and seeded from `client.json`'s names.
- The sample client is now Hebrew first with Arabic
  (`tests/fixtures/client.sample.json`), with Heebo for Hebrew and Alexandria
  for Arabic.
- The tests no longer assume English: the browser tests take "the site's
  first other language" from the generated language list (its pages pass
  axe, a visitor books in it and gets the code and confirmation in it, the
  switch moves to and from it, the owner's stats read in it); the unit tests
  that are about the English pack skip themselves on a client without
  English. The page-picture test covers every other language's public pages.

**Verified**

- Default client: 221 unit tests, 61 browser tests, the 40 page pictures
  unchanged.
- Sample client (he + ar): types, 215 unit tests (6 English-only ones
  skipped), 61 browser tests, Arabic pictures taken and looked at (direction,
  font, plural durations, prices with Latin digits all right).

**Left for later**

- A client whose default language is not Hebrew (Arabic first) builds, but
  the browser tests still assert Hebrew interface text, so they do not run
  for such a client yet.
- The two legal pages and the dog-grooming landing page read the default
  language in Arabic; their text is still code.
- WhatsApp messages in Arabic need the templates approved in Arabic in Meta.

The translation module is complete for this step. Next: Part B, the core
boundaries.

### B1. The extension mechanism (2026-11-09)

**Built**

- `src/extension/types.ts`: the manifest type. Its points grow only when a
  real extension needs one; today: `messages` (its strings per language),
  `seed` (its starting content, after the core's), and its own
  `migrations/` folder by convention. `requires` names the extensions it
  needs on.
- `client.json` lists `extensions`; `pnpm brand` writes
  `src/extensions.generated.ts`, which imports only the enabled manifests,
  so an extension that is off is not in the build. `src/extension/registry.ts`
  checks `requires` and answers `extensions()` / `hasExtension()`.
- Strings: an enabled extension's `languages/<code>.json` is merged into the
  pack (`src/i18n/messages.ts`); the contract lists each extension's
  strings under its name and `pnpm lang:check` covers them.
- Migrations: `pnpm migrate` applies `db/migrations`, then every extension's
  `migrations/*.sql` in the kit, recorded as `<id>/<file>`, on or off. The
  image carries `extensions/`.
- `extensions/pets/`: the first extension. So far it owns the default
  service rules (`seed.json`, written by its `seed`) and empty string files;
  the code that uses them is still in the core and moves next.

**Verified**

- 223 unit tests (the registry, each manifest's id and needs, extension
  migrations recorded under the extension's name), 61 browser tests, the
  40 page pictures unchanged; the bundled seed writes the 7 rules.

**Next**

- B2: pets out of the core, one point at a time, starting with lines
  instead of pets in the hold, the draft and the private link.

## Step 2, part B2: pets out of the core (2026-11-10)

**Built**

- The core books *lines* (a service each) and knows nothing about pets. The
  hold, the draft, the booking routes, the details step, the private link,
  the owner's calendar, today page, customer record and content screen ask
  the extensions that are on at fixed points and never name one.
- New extension points in `src/extension/types.ts` (server, loaded by the
  worker too): `bookingLines` (read, prepare, missing, check, confirm),
  `serviceTags` (a label per service and a filter by address parameter),
  `previewService`, `describeLines` (a name and notes per booked line),
  `customerData` (tables moved on a merge and emptied on an erase, plus the
  export), `catalogActions` (forms of the owner's content screen).
- Page slots in `src/extension/views.ts` (pages only, generated registry
  `src/extension-views.generated.ts`): `lineFields`, `manage`,
  `manageNotices`, `customer`, `catalog`, `privacy`, `landingPages`.
- `extensions/pets/` now holds everything about pets: the rules, the pets
  repository, the booking-line logic, the pet fields, pet photos on the
  private link, the customer's pets panel, the rules panel and its form
  action, its privacy lines and the dog-grooming campaign page.
- Wording: the core packs (he, en, ar) say "service" and "us"; pet and salon
  wording is in `extensions/pets/languages/*.json`, laid over the pack when
  the extension is on. Keys renamed: `service.remove`, `service.max`,
  `service.lineN`, `manage.lines`, `stats.count`. `isMessageKey` counts the
  enabled extensions' strings, so an extension's own error is shown.
- Renamed: `maxPets` to `maxLines`,
  `TooManyPets` to `TooManyLines`, calendar class `cal-event-lines`.
- `tests/fixtures/client.plain.json`: a client with no extensions. The
  browser tests read which extensions are on (`tests/e2e/client.ts`) and
  skip the pet steps without pets; CI runs three clients.

**Verified**

- Default client: 224 unit tests, 61 browser tests, production build and
  worker bundle. 37 of the 40 page pictures are identical; the 3 home page
  ones differ only in the "free today / tomorrow" heading, which depends on
  the hour the pictures are taken.
- Plain client (no extensions): 220 unit tests (4 pet tests skipped), 57
  browser tests. Sample client (he + ar, pets on): 218 unit, 61 browser.

**Still pet-shaped in the core (next)**

- Consent purposes shown on the customer record (`photo_analysis`,
  `gallery_photo`) are a fixed list in the core.
- The export's booking lines no longer carry `pet_id`.
- Starting content (`db/seed/data.json`, the packs' `content.json`) and the
  privacy and accessibility pages still describe a grooming salon; they are
  the client's content and belong to `kit new`.
- The home page's icons on the service cards alternate scissors and a paw.

## Step 2, part B3: AI out of the core (2026-11-10)

Decided by the kit's owner: AI belongs to neither the core nor pets. It is
an extension a client's blueprint switches on.

**Built**

- `extensions/ai/`: the provider (Anthropic adapter and the fake), the job
  runner with the monthly cap, the pre-visit note, the tables (`ai_jobs`,
  `ai_spend`, in its own migration), its two settings, its strings in he, en
  and ar, and its part of the settings screen. Its environment variables
  (`AI_*`) are read by the extension, not by the core's config.
- The provider answers one general question (`ask`: instructions, text, an
  optional picture). What is asked and how the answer is checked belongs to
  a *kind of job*. `summary` is the extension's own kind.
- Another extension uses AI through `extensions/ai/server/api.ts`: it
  describes its kinds and its facts for the note under `provides.ai` in its
  manifest, and queues jobs with `queueAiJob`. Pets do this for photo
  analysis (`extensions/pets/server/photo-ai.ts`: the prompt, the checked
  result, the `ai.photo` switch). With `ai` off, `aiOn()` is false and pet
  photos are not offered.
- The pre-visit note is written from generic facts: the booking, the
  customer record, each line's name and notes (`describeLines`) and what
  extensions add (`lineFacts`). It is written in the site's default
  language; the stored result is `{ text }`.
- New points in the manifest: `settings` (an extension's own settings,
  stored with the core's), `minute` and `daily` (worker jobs), `bookingNotes`
  (a note on a booking for the today page and the calendar), `monthlyCost`
  (a line under the cost tile of the statistics), `customerData.erase`, and
  `provides` (what one extension offers another). New page slot: `settings`
  (where its settings go on the settings screen, and why they are inactive).
- An owner event's type is no longer a fixed list, so an extension can add
  one with its own "event.<type>" string (`ai_cap_reached` is the ai
  extension's).
- Erasing a customer now deletes that customer's AI jobs. Before, the notes
  (which quote what the customer wrote) stayed after an erase.
- `tests/fixtures/client.notes.json`: a client with `ai` alone. CI runs four
  clients.

**Changed in place:** migrations `0004` (no fixed list of event types) and
`0005` (renamed `0005_staff.sql`; the AI tables left it). The kit has no
installed database, so nothing is migrated; a local database made before
this must be made again (`docker compose -f docker/compose.dev.yml down -v`,
`up -d`, then migrate and seed).

**Verified**

- Default client (pets + ai): 225 unit tests, 61 browser tests, production
  build and worker bundle.
- Sample (he + ar, pets, no ai): 212 unit (13 skipped), 60 browser.
- Plain (no extensions): 215 unit (10 skipped), 57 browser.
- Notes (ai alone): 221 unit (4 skipped), 57 browser.

**Not checked:** a real AI call. The Anthropic adapter was reshaped and only
the fake ran; no key is, or should be, in this session.

## Step 2, part B4: the pet tables leave the core migrations (2026-11-10)

- The core's lines table is `appointment_lines` (was `appointment_pets`) and
  has no pet column.
- `extensions/pets/migrations/0001_pets.sql` makes everything pets keep:
  `pets` (with the coat and vet columns that were added later),
  `service_rules`, `pet_photos`, and the `pet_id` column it adds to
  `appointment_lines`. Every extension's migrations are applied whether it
  is on or not, so there is still one database shape.
- Removed from the core: the pets and rules tables in `0002` and `0003`, and
  the files `0009_pet_photos`, `0012_pet_health` and `0015_max_lines` (the
  last only copied an old setting). Changed in place, as in B3: a local
  database made before this must be made again.
- The Dibs import no longer names pets: an imported past visit is a line
  with a service, and the export of future bookings takes a line's name from
  `describeLines`.
- Verified with the four clients (below, after B3's numbers): same counts.

## Step 2, part B5: the Dibs import leaves the core (2026-11-10)

- `extensions/dibs-import/`: the import (`server/dibs.ts`), its script
  (`script.ts`, still `pnpm import:dibs` and `worker/dist/import-dibs.js`),
  the default service map, and its migration (the staging tables, and the
  `dibs_ref` columns it adds to `customers` and `appointments`).
- The core's booking insert no longer has a Dibs column; the import writes
  the reference itself. The reference is removed on an erase by the
  extension's `customerData.erase`.
- The script prints its usage for any client and refuses to do anything for
  a client that has the extension off.
- Changed in place: `0003` lost the two `dibs_ref` columns and `0010` moved.

## Step 2, part C1: the core as three folders (2026-11-10)

**Built**

- `src/server/` is gone. The core is `src/core/booking`, `src/core/website`
  and `src/core/platform`. The catalog repository was split: services, hours
  and time off are booking (`booking/catalog.ts`); products, the gallery and
  the business profile are website (`website/content.ts`). The owner's read
  queries were split the same way (`booking/owner-data.ts`,
  `platform/owner-data.ts`).
- No SQL outside the core: the SQL that sat in routes, the worker, the
  staff-create script and the extensions' manifests moved into core
  functions (`setNotes`, `auditStaff`, `markAllRead`, `ping`,
  `platform/ownerDevices.ts`, `pruneTokens`, `saveStaff`) or the extension's
  `server/` folder. The worker's job claims and owner alerts are
  `platform/jobRuns.ts` and `platform/ownerAlerts.ts`.
- `tests/unit/boundaries.test.ts` checks that SQL is run only in
  `src/core/`, an extension's `server/` folder, the migration runner and the
  seed, and that platform code imports no booking or website code.

**Left as it is**

- Three known crossings from platform into booking, listed in the test:
  `notify/dispatch.ts` reads the appointment and makes the private link when
  it sends a booking message, and `staff/http.ts` reuses the booking form
  helpers.
- `src/core/stats.ts` reads all three modules for the owner's statistics
  screen and sits beside them.
- Extensions still join the core's tables in their own SQL (pets read
  `appointment_lines` and `services`).
- Events: the core modules do not yet announce events that an extension can
  listen to. That is added when Safa's `approval` extension needs it.

**Verified:** the four clients, numbers under C2 below.

## Step 2, part C2: the view layer (2026-11-10)

**Built**

- `src/views/` is the view layer. Every page of the site and of the owner
  area, the frame around each, and the not-found page is a named view in
  `src/views/pages/` (25 of them, listed in `src/views/kit.ts`:
  `site.home`, `site.book`, `site.frame`, `admin.today` and so on). Their
  shared parts, the former `src/components/`, are `src/views/parts/`.
- The route files under `src/app` are thin: each picks its view by name
  with `view("<name>")` and passes on the address parameters. Next's route
  settings (`dynamic`) stay in the route file, and the page title comes from
  the kit's view.
- `theme/views.ts` is the client's list of its own views, by the name of
  the kit's view each one replaces. It is empty in the kit.
- `tests/unit/views.test.ts`: a listed view replaces the kit's, and every
  page and frame under `src/app` is a thin route.

**Different from the design:** the design has the route load the data and
hand it to the view. Here the view loads its own data through the core's
functions and the route passes only the address parameters. A client's view
is then free to read something else from the core, where a fixed data shape
per page would have tied it to what the kit's page needs.

**Not done:** no client view has been written yet, so replacing a view is
proven by the unit test only. Safa's phone-width column will be the first.

**Verified (C1 and C2 together)**

- Default client: 229 unit tests, 61 browser tests, production build and
  worker bundle. 36 of the 40 page pictures are identical; the 4 home page
  ones differ by the hour they were taken (closed and "free tomorrow" in the
  old pictures, open and "free today" now), which moves what is below.
- Sample (he + ar, pets): 212 unit (17 skipped), 60 browser. Plain: 215
  unit (14 skipped), 57 browser. Notes (ai alone): 221 unit (8 skipped), 57
  browser.
