# 02. Architecture

## The layers

```text
┌──────────────────────────────────────────────────────────────┐
│ Extensions   extensions/<id>/   a client's idea, on or off   │
├──────────────────────────────────────────────────────────────┤
│ Views        src/views/         pages and screens, replaceable│
├──────────────────────────────────────────────────────────────┤
│ Core         src/core/booking │ src/core/website │ platform  │
└──────────────────────────────────────────────────────────────┘
  Routes (src/app/) are thin: load from the core, render a named view.
```

| Layer | Owns | May | May not |
|---|---|---|---|
| Core `booking` | Customers, appointments and lines, services, hours, days off, holds, free times, private links | Run SQL on its tables, raise events | Know about any extension |
| Core `website` | Business profile, products, gallery, landing pages, SEO data, visit counts | Run SQL on its tables | Know about any extension |
| Core `platform` | Config, database, staff and sessions, settings, `Notify`, translations, stored files, time, audit log, events | Run SQL | Import booking or website code (a known short list excepted) |
| Views | Every page and owner screen | Call core read functions and post to core actions | Run SQL |
| Extensions | Their own tables (`ext_<id>_*` or their own names), strings, settings | Fill extension points; SQL in `server/` only | Edit core files; override the no-overlap rule or the AI rule |
| Routes `src/app/` | URLs | Load data, render a view, handle a form | Hold business logic |

`tests/unit/boundaries.test.ts` enforces where SQL may run and the
platform-to-booking boundary.

## Runtime

One Docker image, two processes, one Postgres:

| Process | Entry | Does |
|---|---|---|
| web | `node server.js` (Next.js standalone) | Pages, booking, owner area, APIs, webhooks, `/healthz` |
| worker | `node worker/main.js` (bundled from `worker/main.ts`) | Every few seconds: sends the outbox. Every minute: releases expired holds, extensions' `minute` work, daily jobs at their local hour (clean-up, AI notes) |

Release scripts in the same image: `worker/migrate.js`, `worker/seed.js`,
`worker/staff-create.js`, `worker/import-dibs.js`.

Both processes are stateless. State is in Postgres (schema `DB_SCHEMA`,
default `app`, with row-level security on and the app's own restricted role)
and in S3-compatible storage for photos. Configuration is environment
variables only (`env.example`, checked in `src/core/platform/config.ts`).

## Folder map

```text
client.json                 this client's brand, languages, extensions (schema: src/brand.schema.ts)
languages/<code>/           pack.json, messages.json (strings), content.json (starting content), legal/
src/app/                    routes: (site)/, admin/, api/, healthz/
src/views/kit.ts            the list of named views ("site.home", "admin.customers", …)
src/views/pages/, parts/    the kit's views and their shared parts
theme/views.ts              a client's own views, replacing kit views by name
src/core/booking/           service.ts (actions), flow.ts (customer flow), appointments.ts, slots.ts,
                            hours.ts, customers.ts, catalog.ts, owner*.ts (owner reads and actions)
src/core/website/           content.ts, landing pages
src/core/platform/          config, db, time, settings, staff/, identity/, notify/, translation,
                            storage, photos, audit, events, outbox, rateLimits, features
src/core/stats.ts           the owner's statistics
src/extension/              types.ts (server points), views.ts (UI points), registry.ts
src/*.generated.ts          written by `pnpm brand`; never edit
extensions/<id>/            extension.ts, views.tsx, languages/, migrations/, server/, seed
worker/main.ts              the worker
scripts/                    migrate, apply-client (`pnpm brand`), kit (new/status/update), lang tools
db/migrations/              core SQL, numbered, append-only
db/seed/                    data.json (structure) + seed.ts; text comes from the packs
docker/                     Dockerfile, compose.dev.yml (local Postgres), dev-init/
tests/unit, tests/e2e       Vitest and Playwright; tests/fixtures holds the test clients
blueprints/                 example.yaml (committed); clients' blueprints (git-ignored)
.claude/skills/new-client/  the skill that makes a client end to end
```

## How a booking flows

```text
Customer                     Core (booking)                          Worker / Notify
────────                     ──────────────                          ───────────────
/book: pick services, time
  ─ requestHold() ─────────▶ appointment status "held", expires in N min
                             (exclusion constraint: no overlap)
                             code queued ───────────────────────────▶ sent now (Notify.send)
enter the 6-digit code
  ─ verifyAndConfirm() ────▶ phone/email proven, customer found or made
                             extensions' bookingLines.confirm()
                             approval point? → "pending" : "confirmed"
                             confirmation + reminder queued ─────────▶ outbox → route() → driver
                             owner event "booking_created" ─────────▶ push alert to the owner
/b/<token>: move or cancel ─▶ moveBooking() / cancelBooking()        change messages queued
Owner: done / no-show / cancel / move / create (api/admin/bookings)
Worker every minute: releaseExpiredHolds() → "released"
```

Statuses: `held` → `pending` (approval) or `confirmed` → `completed`,
`no_show` or `cancelled`; an expired hold becomes `released`. Only `held`,
`pending` and `confirmed` take a time.

## Notifications

`Notify` (`src/core/platform/notify/index.ts`) is the only way to send:
`queue`, `send`, `cancel`, `plan`, `channels`. Rows go to `message_outbox`;
the worker picks them up; `route()` (`routing.ts`) picks the channel order;
the channel's driver sends. Channels: `messaging` (Meta or Twilio), `email`
(http, smtp, gmail), `push` (webpush). `PROVIDERS=fake` makes every driver
write to the `fake_messages` table. Templates are in `message_templates`,
seeded from each pack's `content.json`, editable by the owner.

## Events and alerts

`addOwnerEvent()` (`platform/events.ts`) records what the owner should know
(booked, moved, cancelled, message failed, reply received) and queues the
alert in the same transaction. Extensions can add their own event types
(with an `event.<type>` string).

## Extensions in one paragraph

`client.json` lists the extensions that are on. `pnpm brand` writes
`src/extensions.generated.ts` and `src/extension-views.generated.ts`, which
import only those, so an extension that is off is not in the build. The core
asks `src/extension/registry.ts` at each point ("which fields does a line
have?", "is approval needed?"). Server points are typed in
`src/extension/types.ts` (bookingLines, serviceTags, previewService,
describeLines, customerData, cleanup, settings, minute, daily, bookingNotes,
monthlyCost, provides, openingRanges, approval, customerMessages,
catalogActions, seed, messages). UI points are in `src/extension/views.ts`
(lineFields, manage, customer, catalog, privacy, settings, contactLinks,
hoursFields, today, adminPages at `/admin/x/<slug>`, actions at
`/api/ext/<id>/<name>`, landingPages). **Every** extension's migrations run
on every client, on or off, so there is one database shape.

## Languages

Two levels. Strings: `languages/<code>/messages.json`, read through
next-intl (`getI18n()` on the server, `useI18n()` in the browser, `lp()` for
links). Content the owner types: the default language in the table's own
column, other languages in `content_translations`, read with `pick()` /
`translatedSql()`. The default language has plain addresses; others live
under `/<code>`. `languages/contract.json` describes everything translatable;
`pnpm lang:check` checks packs against it.

## Brand

`client.json` → `pnpm brand` → `src/app/brand.css` (colour, font, radius
tokens used by Tailwind), the generated language lists and the extension
registries. Changing the look of a client is editing `client.json` and its
`theme/` views, never a kit CSS file.

## Security in short

Owner sign-in: email, password and an authenticator code (or an email code),
sessions hashed in `staff_sessions`, CSRF token on every form. Customer
identity: a code to a phone or email, trusted devices, rate limits
(`rate_limits` table). Webhooks are signed (`WEBHOOK_SECRET_MESSAGING`).
Every change by staff is written to `audit_log` with `writeAudit()`. Row
level security is on for every table, and the app's role has rights on its
own schema only.
