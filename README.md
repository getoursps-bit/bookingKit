# Fluffy Fur

Hebrew, right-to-left website and booking system for one grooming salon:
public site, online booking with WhatsApp or email codes, private booking
links, an owner area with calendar and alerts, optional AI help, and a Dibs
import for switch day.

- Design: [`docs/designs/fluffy_fur.md`](docs/designs/fluffy_fur.md) (wins over the brief)
- Original brief: [`docs/build-brief.md`](docs/build-brief.md)
- What was built, stage by stage: [`docs/build-notes.md`](docs/build-notes.md)
- Setup and daily use: [`docs/guide.md`](docs/guide.md)
- Switch day: [`docs/launch-checklist.md`](docs/launch-checklist.md)

## Local setup

Needs Node 22, pnpm 9 and Docker.

```sh
pnpm install
cp env.example .env.local            # PROVIDERS=fake: no outside service is called
set -a; . ./.env.local; set +a       # the scripts and the worker read the environment
docker compose -f docker/compose.dev.yml up -d   # Postgres on port 5433
pnpm migrate && pnpm seed            # schema and starting content; safe to repeat
pnpm dev                             # http://localhost:3000
pnpm worker                          # in a second shell: sends messages, runs timed jobs
```

Fill in `.env.local` first: `APP_BASE_URL=http://localhost:3000`, a
`SESSION_SECRET` of at least 32 characters, and
`DATABASE_URL=postgres://fluffyfur_app:fluffyfur-dev@localhost:5433/postgres`.

With `PROVIDERS=fake`, WhatsApp, email and push messages are written to the
`fake_messages` table instead of being sent, photos go to in-memory storage,
and AI returns fixed answers. Booking codes can be read there:

```sql
select recipient, body from fluffyfur.fake_messages order by id desc limit 5;
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
src/components/       site, booking, admin and shared UI
src/i18n/he.json      every interface string, read through t()
src/landing/          campaign landing pages (code)
src/server/           domain logic: booking engine, identity, notify (outbox and route()),
                      repos, ai, photos, import, staff, time (Asia/Jerusalem)
worker/               worker entry point and timed jobs; bundled to worker/dist
scripts/              migrate, staff-create, import-dibs
db/migrations/        plain SQL, additive first, never run on start-up
db/seed/              starting content and the Dibs mapping file
docker/               Dockerfile (one image, two entry points) and local compose
tests/unit, tests/e2e
```

The image runs the web app with `node server.js` and the worker with
`node worker/main.js`. Health is `GET /healthz`. All configuration comes from
environment variables (see `env.example`); a service without keys is switched
off, not faked, when `PROVIDERS=real`.

## Adding a landing page

1. Create `src/landing/<slug>.tsx` that exports `meta` (`title` and
   `description` for `he` and `en`) and a default component that picks its
   text by `locale`. Copy `dog-grooming.tsx` as a start.
2. Add it to `LANDING_PAGES` in `src/landing/index.ts`.
3. It is served at `/l/<slug>` and `/en/l/<slug>` and listed in the sitemap. Use logical CSS
   (`ms-`, `pe-`, `text-start`), wrap prices, times and phone numbers with
   `isolate()` / `t()`, and check it at phone width.

## Languages

Hebrew is served at the plain addresses and English under `/en`. The switch
in the header, footer and owner menu goes through `/lang/<he|en>?back=<path>`
and is remembered in the `ff_locale` cookie (the owner area has no `/en` and
follows the cookie). Every string lives in both `src/i18n/he.json` and
`src/i18n/en.json`. The owner can fill an English version of each service,
product, photo text, tagline and message; empty fields show the Hebrew.
Customers get messages in the language they booked in. English WhatsApp
messages need the same templates approved in English in Meta first; until
then, leave the WhatsApp English wording empty and those messages go out in Hebrew.
