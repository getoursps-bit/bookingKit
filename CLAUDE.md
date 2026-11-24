# bookingKit

The shared template that each client's booking site is cloned from: a public
site, online booking and an owner area for one small business. It started as a
copy of Fluffy Fur (a grooming salon), which is why the default brand and the
pet features are still here.

The direction is in `docs/designs/` (one file per step); stage notes are in
`docs/build-notes.md`. Fluffy Fur's own design, brief and build notes are kept
in `docs/reference/` to explain why the engine works the way it does.

## Kit rules

- Everything that makes a site one client's (name, colours, fonts, corner
  rounding, logo mark, app icon, brand wording) lives in `client.json`. No
  client name, brand colour or client prefix anywhere else in `src/`,
  `public/`, `worker/` or `db/`; a unit test checks this.
- `src/app/brand.css`, `src/i18n/*.generated.ts`, `src/extensions.generated.ts`,
  `src/extension-views.generated.ts` and `languages/contract.json` are
  generated from `client.json`, the extensions and the language packs. Never
  edit them by hand; run `pnpm brand` and commit the result.
- Never change the opening paragraph of `CLAUDE.md` or `README.md` (up to the
  first `##` heading): `pnpm kit new` rewrites it in every client, so a kit
  change there makes every client's `pnpm kit update` conflict.
- The system has three layers: core (booking, website, platform), views, and
  extensions. A client's idea (pets, booking approval) is an extension, never
  an `if` in the core. The core never names an extension; it asks the
  registry for a point. See `docs/designs/step2_modules_languages.md`.
- From step 4 the core is only customers, bookings, services, opening hours,
  days off, website content and the platform. Everything else (payments,
  accounting, invoices, shop, courses, advanced statistics, MCP, webhooks,
  connectors, extra channels) is a module in `extensions/<id>/`, arrives
  switched off, and is built only after its `extensions/<id>/SPEC.md` is
  agreed.
- An extension a client does not use is switched off, never deleted.
- A change that only one client needs belongs in that client's repo, as an
  extension or a view of its own, not here.
- Prefer a well-known library to hand-written code where one exists.
- Client repos are separate clones with their own database, image and domain.
  Never connect this repo to a client's server or database.
- A fix or feature every client should get is made here, then taken into each
  client's project with `pnpm kit update`. Never fix the same thing in two
  client projects by hand.

## Engine rules

- Hebrew, right to left, mobile first. Check every page at phone width.
- SQL runs only in `src/core/**` and `extensions/<id>/server/**`. Platform code does not import booking or website code (the known list in `tests/unit/boundaries.test.ts` may only get shorter).
- Use logical CSS only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`); lint fails on physical left/right classes.
- Wrap numbers, prices, times and phone numbers with `isolate()` / `t()` so they display in the right order.
- Languages come from `client.json` (`languages`); each one is a pack in `languages/<code>/`. The default language has the plain paths, each other one lives under `/<code>`. Every string goes in every pack's `messages.json` (Hebrew is the reference); never compare a language code in code, read `PACKS` from `src/i18n/locales.ts`. Use `getI18n()` / `useI18n()`, `lp()` for links and `pick()` for owner text with an English field.
- One stateless container with two entry points (web, worker); health path `/healthz`; config from environment variables only; JSON logs; immutable image tags.
- Never write secrets, real phone numbers or customer data into code, tests, logs, commits or chat. Show `.env` key names only.
- Every outside service sits behind an interface with a fake; `PROVIDERS=fake` locally and in CI.
- Times are stored in UTC and handled in Asia/Jerusalem through `src/core/platform/time.ts` only. Test both clock changes.
- The no-overlap booking rule lives in the database, not only in code.
- Every message goes through `Notify` (`src/core/platform/notify`): the outbox, then `route()`, then the channel's driver. Nothing else picks a channel, and nothing outside that folder touches a driver.
- AI never blocks or changes a booking.
- Migrations are plain SQL, additive first, and never run on app start-up.
- Ask before choosing a provider, adding a paid service, or changing a decision in a design. Record the answer, with the date, where it belongs.
- Done means: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass for the default client and the test clients; a short note in `docs/build-notes.md` (what, what was verified, what is not done); committed on a branch and merged into `main`.

## Handover docs

`docs/handover/README.md` is the long form of these rules, written for a
developer or an agent taking the project over: the product, the
architecture, where a change belongs with step-by-step recipes, client
projects, deployment and testing. Read it before a task that is new to you;
its task router says which file to open for each kind of job.

## Requirements

`docs/requirements.md` says **what** must be true for step 4; the design
(`docs/designs/step4_owner_platform.md`) says **how**. If they disagree, the
requirements win and the design is corrected.

- Each requirement has an id (`R<part>.<n>`); cite it in commits, build notes
  and module specs.
- The owner's decisions (D1–D8) are fixed; change one only when the owner of
  the kit says so, with the new date.
- Do not build anything blocked by an item under "Open decisions" until it is
  answered; then move the answer into the decisions table and remove it there.

## Commands

- `docker compose -f docker/compose.dev.yml up -d` starts local Postgres (port 5435).
- `pnpm migrate` (`--check` lists pending) and `pnpm seed` apply the schema and starting content; both are safe to repeat.
- `pnpm brand` regenerates `src/app/brand.css`, `src/i18n/*.generated.ts` and `languages/contract.json` after `client.json` or a language pack changes.
- `pnpm kit new [blueprints/<client>.yaml]` makes a new client's project folder next to the kit, with its `INITIAL_PROMPT.md`; `blueprints/example.yaml` explains every field.
- `pnpm kit status` lists the client projects next to the kit and how far behind each is; `pnpm kit update`, run in a client's project, merges the kit's later changes in.
- `pnpm lang:check [code]` checks the language packs against the reference pack and the seed.
- `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- `pnpm test:e2e` needs `pnpm exec playwright install chromium` once; it starts its own server on port 3600.
- `VISUAL=1 pnpm test:e2e visual` compares page pictures (`--update-snapshots` takes them).
- `pnpm worker` runs the worker; `pnpm staff:create <email>` makes an owner account.
- `pnpm import:dibs <file.csv> --dry-run` (then `--freeze-time=<ISO>`, `--queue-links`, `--export-future=<file>`); switch day steps are in `docs/launch-checklist.md`.
