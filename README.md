# bookingKit

The shared template that each client's booking site is cloned from: public
site, online booking with WhatsApp or email codes, private booking links, an
owner area with calendar and alerts, optional AI help, and a Dibs import for
switch day. Hebrew, right to left, with English under `/en`.

It started as a copy of Fluffy Fur, a grooming salon, so that is the default
brand and the pet features are still here.

- Where this is going, one file per step: [`docs/designs/`](docs/designs/)
- What was built: [`docs/build-notes.md`](docs/build-notes.md)
- Setup and daily use: [`docs/guide.md`](docs/guide.md)
- Switch day: [`docs/launch-checklist.md`](docs/launch-checklist.md)
- Why the engine works the way it does (Fluffy Fur's design and notes):
  [`docs/reference/`](docs/reference/)

## Local setup

Needs Node 22, pnpm 9 and Docker.

```sh
pnpm install
cp env.example .env.local            # PROVIDERS=fake: no outside service is called
set -a; . ./.env.local; set +a       # the scripts and the worker read the environment
docker compose -f docker/compose.dev.yml up -d   # Postgres on port 5435
pnpm migrate && pnpm seed            # schema and starting content; safe to repeat
pnpm dev                             # http://localhost:3000
pnpm worker                          # in a second shell: sends messages, runs timed jobs
```

Fill in `.env.local` first: `APP_BASE_URL=http://localhost:3000`, a
`SESSION_SECRET` of at least 32 characters, and
`DATABASE_URL=postgres://app_user:app-dev@localhost:5435/postgres`.

With `PROVIDERS=fake`, WhatsApp, email and push messages are written to the
`fake_messages` table instead of being sent, photos go to in-memory storage,
and AI returns fixed answers. Booking codes can be read there:

```sql
select recipient, body from app.fake_messages order by id desc limit 5;
```

The owner area is at `/admin`. Create an account (the command prints the key
for an authenticator app):

```sh
pnpm staff:create owner@example.test
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Web app with hot reload |
| `pnpm build` | Production build of the web app and the bundled worker scripts |
| `pnpm test` | Unit tests (the `*.db.test.ts` ones need the local Postgres) |
| `pnpm test:e2e` | Browser tests on a phone-size screen (`pnpm exec playwright install chromium` once) |
| `pnpm lint` / `pnpm typecheck` | ESLint (fails on physical left/right CSS) and TypeScript |
| `pnpm migrate` | Applies pending SQL migrations; `--check` only lists them |
| `pnpm seed` | Inserts starting content without overwriting edits |
| `pnpm brand` | Writes the stylesheet, the language list and the language contract from `client.json` and the packs; `--check` only compares |
| `pnpm lang:check [code]` | Checks the language packs: wrong placeholders, unknown keys, text over its limit, and what is still missing |
| `pnpm staff:create <email>` | Creates or resets an owner account |
| `pnpm import:dibs <file.csv> --dry-run` | Practice Dibs import: stages, checks and reports only |
| `pnpm import:dibs <file.csv> --freeze-time=<ISO>` | Real import (no messages, no alerts) |
| `pnpm import:dibs --queue-links` | After the switch: one "your new link" message per imported booking |
| `pnpm import:dibs --export-future=out.csv` | Every future booking, to enter back into Dibs if the switch is undone |

In the image, the same scripts are `node worker/migrate.js`, `node worker/seed.js`,
`node worker/staff-create.js` and `node worker/import-dibs.js`.

## Layout

```text
src/app/(site)/       public pages, booking (/book) and the private link (/b/<token>)
src/app/admin/        owner area (installable as its own app)
src/app/api/          form and JSON endpoints, webhooks, health
src/views/            the view layer: every page as a named view (pages/), their shared
                      parts (parts/), and the list a client can replace from (kit.ts)
theme/views.ts        this client's own views, by the name of the kit's view each replaces
languages/<code>/     one pack per language: its strings (messages.json) and what the code needs to know about it (pack.json)
src/i18n/             the string lookup (on next-intl), language addresses and formats
src/core/booking/     what makes it a booking system: services, hours, customers, appointments
                      and their lines, holds, free times, the private link
src/core/website/     what makes it a website: the business profile, products, gallery,
                      landing pages, search-engine data, visit counts
src/core/platform/    what both need: config, database, staff and sessions, settings, the
                      outbox and route(), translations, stored files, time (Asia/Jerusalem)
src/extension/        the extension points and the registry of the extensions that are on
extensions/<id>/      one folder per extension: manifest, strings, migrations, starting content
worker/               worker entry point; bundled to worker/dist
scripts/              migrate, staff-create
db/migrations/        plain SQL, additive first, never run on start-up
db/seed/              starting content
docker/               Dockerfile (one image, two entry points) and local compose
tests/unit, tests/e2e
```

The image runs the web app with `node server.js` and the worker with
`node worker/main.js`. Health is `GET /healthz`. All configuration comes from
environment variables (see `env.example`); a service without keys is switched
off, not faked, when `PROVIDERS=real`.

## The core

The system is a booking system and a website in one, and its core is three
modules under `src/core/`: `booking`, `website` and `platform` (what both
need). They own the database: pages, routes, the worker and the extensions'
manifests call their functions and never run SQL themselves. Platform code
does not import booking or website code. `tests/unit/boundaries.test.ts`
checks both rules; the few places where the platform still reaches into
booking are listed there and the list may only get shorter.

## Extensions

A client's customisation is an extension: a folder under `extensions/` with
a manifest (`extension.ts`), its own strings per language, its own
migrations and its starting content. `client.json` lists the ones that are
on, and `pnpm brand` writes the registry the code reads; an extension that
is off is not in the build, and its code stays in the kit. The core offers
fixed extension points (see `src/extension/types.ts`) and never carries an
`if` for one client. What an extension shows in pages is in its `views.tsx`
(see `src/extension/views.ts`), kept apart so the worker never loads React.

`pets`, the grooming salon's customisation, is the first extension: the pet
fields of a booking, the dog or cat filter, pet photos, the pet-to-service
rules and the pet and salon wording all live in `extensions/pets/`. With
`"extensions": []` the site is a plain booking site; `tests/fixtures/client.plain.json`
is tested that way.

`ai` is the second: a short note for the owner about each of tomorrow's
bookings, and AI calls that other extensions ask for, inside one monthly cap
she sets. It is not part of the core and not part of pets: a client's
blueprint switches it on. Everything about it is in `extensions/ai/` (the
provider, the job runner, its tables, its settings and strings), and it reads
the `AI_*` variables. Another extension uses it through
`extensions/ai/server/api.ts`: pets ask it to look at a pet's photo and give
the note the pet's facts, under `provides.ai` in their manifest. With `ai`
off, pet photos are not offered. `tests/fixtures/client.notes.json` is a
client with `ai` alone.

`dibs-import` is the salon's move from the booking system it used before:
the `pnpm import:dibs` script, its staging tables and the Dibs references.
It has no pages, and the script refuses to run for a client that has it off.

`map-links` adds Google Maps and Apple Maps to the contact row. `split-hours`
lets a weekday have a second opening range after a break; the core already
treats a day as a list of ranges, and this extension keeps the second one
and asks the owner for it on the hours screen.

## Re-branding

Everything that makes the site one client's is in `client.json`: its
languages, the name in each language, the brand mark, the client's own
wording, fonts, colours, corner rounding, shadows and the app icon. `src/brand.schema.ts` says what
each field is for.

1. Edit `client.json`. `tests/fixtures/client.sample.json` is a second,
   complete example.
2. `pnpm brand` writes `src/app/brand.css` and `src/i18n/*.generated.ts`
   from it. Commit them with `client.json`.
3. `pnpm test` checks the file's shape, that the main text colours are
   readable on their backgrounds, and that the stylesheet is up to date.
4. `pnpm test:e2e` runs the accessibility check on every page with the new
   colours.

A brand is fixed when the image is built. The name the owner types in the
owner area still wins in the header, footer and search results; `client.json`
supplies the starting value, the browser title and the app name.

## Adding a landing page

1. Create `src/core/website/landing/<slug>.tsx` that exports `meta` (`title` and
   `description` for `he` and `en`) and a default component that picks its
   text by `locale`. Copy `dog-grooming.tsx` as a start.
2. Add it to `LANDING_PAGES` in `src/core/website/landing.ts`. A page for one
   client only belongs to that client's extension instead (`landingPages`
   in its `views.tsx`, as `extensions/pets/views/dog-grooming.tsx`).
3. It is served at `/l/<slug>` and `/en/l/<slug>` and listed in the sitemap. Use logical CSS
   (`ms-`, `pe-`, `text-start`), wrap prices, times and phone numbers with
   `isolate()` / `t()`, and check it at phone width.

## Languages

The site's languages are listed in `client.json`:

```json
"languages": { "default": "he", "others": ["en"] }
```

Each language is a pack, a folder under `languages/`:

- `pack.json`: the language's own name, its direction, and the locales used
  for prices, link previews and day and month names. The kit ships Hebrew
  (the reference), English and Arabic;
- `messages.json`: every interface string. Hebrew is the reference: a unit
  test fails when a pack misses a key or a placeholder;
- `content.json`: the starting content in that language (service and
  product names and descriptions, message wording). The seed's structure
  (durations, prices, hours, which templates exist) is `db/seed/data.json`;
  the site's default language fills the tables' own text columns and every
  other language goes into `content_translations`.

`languages/contract.json` (written by `pnpm brand`) describes everything a
pack must hold: each string with its placeholders, each piece of content
with its length limit, and the text of the packs already in the kit. It is
the one file a translator, or an AI, needs to write a new pack.
`pnpm lang:check <code>` then reports what is wrong and what is still
missing.

The strings are read through [next-intl](https://next-intl.dev); plurals are
written in the strings in ICU syntax (see `duration` in a pack). A font for
one language is set in `client.json` under `theme.fonts.languages`.

The default language is served at the plain addresses and each other
language under `/<code>`. The switch in the header, footer and owner menu
shows each other language by its own name, goes through
`/lang/<code>?back=<path>` and is remembered in the `bk_locale` cookie (the
owner area has no prefix and follows the cookie). A one-language site shows
no switch.

To add a language to the kit: make `languages/<code>/` with `pack.json`,
`messages.json` and `content.json` from the contract, and run
`pnpm lang:check <code>` until it is complete. To add it to a client: add its
code to `others` in `client.json` and run `pnpm brand`.

The owner's own text (services, products, photo texts, tagline, message
wording) is written in the default language, and the owner area shows one
extra field per other language. Those translations live in one table,
`content_translations`, owned by `src/core/platform/translation.ts`; an empty
translation shows the default language. Customers get messages in the
language they booked in when the template has wording in it. WhatsApp
messages in another language need the same templates approved in that
language in Meta first; until then, leave that wording empty and those
messages go out in the default language.
