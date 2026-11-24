# Handover: start here

Written for a developer, or an AI coding agent working for one, who takes
over bookingKit. Read this file whole before changing anything. It tells you
what the project is, which file answers which question, and the rules that
must never be broken.

## In five lines

1. bookingKit is a **template** for one small business's website with online
   booking and an owner area (Next.js 16, Postgres, Node 22, one Docker image).
2. Each client (a salon, a studio, a clinic) gets **its own repo cloned from
   the kit**, with its own database, server and domain.
3. A fix or feature for every client is made **in the kit** and taken into
   each client's repo with `pnpm kit update`. It is never made twice by hand.
4. The code is **core** (booking, website, platform) + **views** (pages) +
   **extensions** (a client's idea, switched on per client in `client.json`).
5. Hebrew first, right to left, phone width first; any number of languages
   from language packs.

## Read in this order

| # | File | Answers |
|---|---|---|
| 1 | this file | What it is, where to look, the hard rules |
| 2 | [`01-product.md`](01-product.md) | Why it exists, who uses it, the business model, where it is going |
| 3 | [`02-architecture.md`](02-architecture.md) | How the code is organised and how a booking flows through it |
| 4 | [`03-adding-features.md`](03-adding-features.md) | Where a change belongs, and step-by-step recipes |
| 5 | [`04-clients.md`](04-clients.md) | Making a client project, updating it, what a client may change |
| 6 | [`05-deployment.md`](05-deployment.md) | Local setup, the image, the server, releases, rollback |
| 7 | [`06-testing.md`](06-testing.md) | The checks, the test clients, when a change is done |
| 8 | [`../requirements.md`](../requirements.md) | **What was asked for**: every requirement with an id, the owner's decisions, and how to tell each is met |
| 9 | [`../designs/step4_owner_platform.md`](../designs/step4_owner_platform.md) | **How it will be built**: the order of work and its open decisions |

Deeper references, read when a task touches them:

- `../../CLAUDE.md`: the rules, short form. Always loaded by Claude Code.
- `../../README.md`: commands, layout, extensions, notifications, languages.
- `../designs/step1_brand.md`, `../designs/step2_modules_languages.md`: why
  the brand file, the language packs and the extension mechanism are shaped
  the way they are.
- `../build-notes.md`: what was built in each stage, what was verified, and
  what is known not to work yet. Search it before assuming something is done.
- `../guide.md`: server setup and the owner's daily use (for people).
- `../launch-checklist.md`: switching a client from an old booking system.
- `../reference/`: the first client's (Fluffy Fur) design and notes.

## Task router

| If you are asked to… | Read first | Then |
|---|---|---|
| Fix a bug every client has | `02-architecture.md` | Fix in the kit, test, commit, `pnpm kit update` in each client (`04-clients.md`) |
| Add a feature | `03-adding-features.md` "Where does it belong" | Follow the matching recipe |
| Build the next planned step | `../requirements.md`, then `../designs/step4_owner_platform.md` | Its "For the developer taking this over" and "Order of work" |
| Make a new client | `04-clients.md` | The `new-client` skill (`.claude/skills/new-client/SKILL.md`) does it end to end |
| Change one client only | `04-clients.md` "What a client may change" | Work in that client's repo, never in the kit |
| Deploy or release | `05-deployment.md` | Write or update the client's `DEPLOY.md` |
| Add a language | `03-adding-features.md` recipe "A language" | `pnpm lang:check <code>` |
| Add a provider (email, SMS…) | `03-adding-features.md` recipe "A notification driver" | Ask the owner of the kit before choosing one |
| Understand why something is odd | `../build-notes.md`, `../designs/` | `git log -S '<text>'` |

## Hard rules

Breaking one of these is a bug even if every test passes. Several are
enforced by tests (marked ✓).

**Kit and clients**

- No client's name, colour or wording anywhere in `src/`, `public/`,
  `worker/` or `db/`; it lives in `client.json` ✓.
- A client's idea is an **extension**, never an `if` in the core. The core
  never names an extension; it asks the registry for a point.
- An extension a client does not use is switched off, never deleted.
- A change only one client needs is made in **that client's repo**.
- Never connect the kit to a client's server or database.
- Generated files (`src/app/brand.css`, `src/i18n/*.generated.ts`,
  `src/extensions.generated.ts`, `src/extension-views.generated.ts`,
  `languages/contract.json`) are never edited by hand: run `pnpm brand` ✓.
- Do not change the opening paragraph of `CLAUDE.md` or `README.md` (up to
  their first `##` heading). `pnpm kit new` rewrites it in every client, so a
  kit change there makes every client's `pnpm kit update` conflict.

**Code**

- SQL runs only in `src/core/**` and `extensions/<id>/server/**` ✓.
- Platform code does not import booking or website code ✓ (a short known
  list in `tests/unit/boundaries.test.ts` may only get shorter).
- Logical CSS only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) ✓ (lint).
- Every visible string is in every language pack's `messages.json` ✓; read
  languages from `PACKS`, never compare a language code in code.
- Numbers, prices, times and phone numbers are wrapped with `isolate()` / `t()`.
- Times are stored in UTC and handled through `src/core/platform/time.ts` only.
- The no-overlap rule for bookings lives in the database (an exclusion
  constraint), not only in code.
- Every message goes through `Notify`; nothing outside
  `src/core/platform/notify/` touches a driver ✓.
- Every outside service has an interface and a fake; `PROVIDERS=fake`
  locally and in CI.
- The site's own AI never blocks or changes a booking.
- Migrations are plain SQL, additive first, and never run on start-up.
- Prefer a well-known library to hand-written code.

**Secrets and data**

- Never write secrets, real phone numbers or customer data into code, tests,
  logs, commits or chat. Show `.env` key names only.

**Asking**

- Ask the owner of the kit before choosing a provider, adding a paid
  service, or changing a decision written in a design. Record the answer,
  with the date, in the design it belongs to.

## Definition of done

A change is done when, for the default client **and** the test clients
(`06-testing.md`): `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:e2e` and `pnpm build` pass; a short note is in
`docs/build-notes.md` (what, what was verified, what is not done); and the
work is committed on a branch and merged into `main`.

## Glossary

| Word | Means |
|---|---|
| Kit | This repo, bookingKit, the template |
| Client, client project | One business's repo, a clone of the kit (`~/Containers/<client>`) |
| Owner | The business owner who uses the owner area (`/admin`) |
| Customer | A person who books on the public site |
| Staff | Anyone who can sign in to the owner area |
| Core | `src/core/`: booking, website, platform |
| View | A named page or screen (`src/views/kit.ts`), replaceable per client |
| Extension, module | A folder `extensions/<id>/` that adds to the core through fixed points |
| Extension point | A named hook the core offers (`src/extension/types.ts`, `views.ts`) |
| Pack | A language folder `languages/<code>/` |
| Blueprint | A YAML file describing a new client, read by `pnpm kit new` |
| Hold | A booking that keeps a time for a few minutes while the customer proves their phone or email |
| Line | One service inside a booking |
| Private link | `/b/<token>`: the customer's page to see, move or cancel a booking |
| Outbox | The `message_outbox` table; the worker sends what is in it |
| Driver | One provider for a channel (Meta, Twilio, SMTP…) |
