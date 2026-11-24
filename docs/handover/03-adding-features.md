# 03. Adding features

## Step 0: where does it belong?

Answer these in order and stop at the first "yes".

| # | Question | If yes |
|---|---|---|
| 1 | Does only one client want it? | Build it in **that client's repo**: an extension under its `extensions/`, or a view in its `theme/views.ts`. Not in the kit |
| 2 | Is it a bug or gap every client has in booking, the website or the platform? | **Core** change in the kit (recipe A) |
| 3 | Is it an idea some clients want and others do not (pets, approval, a shop, payments, a connector)? | **Extension** in the kit, off by default (recipe B) |
| 4 | Does an extension need the core to call it somewhere new? | **New extension point** (recipe C), added with the extension that needs it |
| 5 | Is it only how something looks? | A brand token in `client.json` (every client can set it), or a view (recipe D) |
| 6 | Is it a new outside service? | A driver behind an interface with a fake (recipe F). **Ask before choosing the provider** |

When unsure between core and extension: if a salon, a clinic and a course
studio would all switch it on, it is core. Money (payments, accounting,
invoices, shop), connectors, MCP and extra channels are decided as
extensions (step 4 design, "Core and modules").

Before you build, check: is it already planned in `docs/designs/`, or listed
as not done in `docs/build-notes.md`? Follow the design if so.

## Every change, whatever the recipe

1. Branch from `main`.
2. Make the change, with tests (unit for logic, `*.db.test.ts` for SQL, e2e
   for a page).
3. New strings: add the key to **every** pack's `messages.json`
   (`languages/he/` is the reference); run `pnpm brand` and `pnpm lang:check`.
4. Check the page at phone width, in a right-to-left and a left-to-right
   language.
5. Run the full check for every test client (`06-testing.md`).
6. Add a short note to `docs/build-notes.md`: what, verified how, not done.
7. Commit, merge into `main`, then take it into each client
   (`04-clients.md`).

---

## Recipe A: a core change

Example: the customers page should list every customer (step 4, part 1).

1. **Data**: add or change a read function in the module that owns the
   table (`src/core/booking/owner-data.ts` for owner reads). No SQL anywhere
   else.
2. **Action**: a change goes through a function in `src/core/<module>/`
   (for bookings, `service.ts` or `owner.ts`), inside `withTransaction`,
   with `writeAudit()` for staff changes and `addOwnerEvent()` when the
   owner should hear about it.
3. **Schema**: a new migration file (recipe E). Additive only.
4. **View**: change the view in `src/views/pages/...`. The route in
   `src/app/` stays a thin `view("<name>")`.
5. **Form handler**: owner forms post to `src/app/api/admin/<area>/route.ts`,
   which checks the staff session and CSRF (`src/core/platform/staff/http.ts`)
   and calls the core action.
6. If an extension might want to add to it, add a slot now only if an
   extension needs it now. Points are not added speculatively.

## Recipe B: a new extension

Example: `payments` (step 4). Folder `extensions/<id>/`, id in lower case
with dashes.

```text
extensions/<id>/
  SPEC.md                 its spec (step 4: nine headings), written and agreed first
  extension.ts            manifest: data and server behaviour, no React
  views.tsx               what it shows in pages (optional)
  languages/he.json …     its strings, one file per pack the kit has (he, en, ar)
  migrations/0001_<id>.sql   its tables (optional)
  server/…                its SQL and rules (the only place it may run SQL)
```

1. **Spec**: write `SPEC.md` (purpose; what it uses from the core; its
   tables; screens and slots; settings with defaults; permissions; messages;
   what it needs and whether it is paid; what it does not do).
2. **Manifest** `extension.ts`. Start the file with `// ` comment lines
   describing it in plain words: `pnpm kit new` shows the first sentence when
   a client is made.

   ```ts
   import { defineExtension } from "@/extension/types";
   import he from "./languages/he.json";
   import en from "./languages/en.json";
   import ar from "./languages/ar.json";

   // One sentence that says what this does for the owner or the customer.

   export default defineExtension({
     id: "<id>",
     requires: [],                      // other extensions it needs on
     messages: { he, en, ar },
     settings: { "<id>.something": z.boolean().default(false) },
     // fill only the points it needs; see src/extension/types.ts
   });
   ```
3. **Views** `views.tsx` with `defineViews({ id: "<id>", ... })`: an owner
   screen is `adminPages` (served at `/admin/x/<slug>`, with a menu entry);
   a form it posts is `actions` (served at `/api/ext/<id>/<name>`; the
   handler checks staff, CSRF and the form itself); a panel on the customer
   record is `customer`; on the today page `today`; settings switches go in
   `settings`.
4. **Tables**: `migrations/0001_<id>.sql`. Prefix tables (`ext_<id>_…`),
   `enable row level security` on each, reference core rows by id with
   foreign keys, and never alter a core table from an extension. These
   migrations run on **every** client, on or off.
5. **Customer data**: if it stores anything about a customer, fill
   `customerData` (tables with `customer_id` are moved on merge and emptied
   on erase; add `export`).
6. **Turn it on for the default client only if the default client uses it.**
   Otherwise add a test client in `tests/fixtures/client.<name>.json` with it
   on, and add that file to the CI matrix (`.github/workflows/ci.yml`).
7. **Tests**: `tests/unit/<id>.test.ts` or `.db.test.ts`, wrapped in
   `describe.skipIf(!hasExtension("<id>"))`, so the suite passes for clients
   that have it off. A core test never mentions an extension.
8. `pnpm brand`, then the full check for every test client.

A client switches it on by adding the id to `extensions` in its
`client.json` and running `pnpm brand`.

## Recipe C: a new extension point

Only when an extension needs the core to ask it something new.

1. Add the point, typed and documented, to `src/extension/types.ts` (server)
   or `src/extension/views.ts` (UI). Say what the core passes, what it
   expects back, and inside which transaction it runs.
2. Add a reader to `src/extension/registry.ts` if more than `firstWith()` is
   needed.
3. Call it from the core at the right place. The core asks "who fills this
   point", never "is extension X on".
4. A point may not let an extension bypass the no-overlap constraint, the
   `Notify` layer, or decide a booking by AI.
5. Test the point with the extension that needs it, and test that the core
   behaves as before with no extension filling it (`client.plain.json`).

Planned points for step 4: `bookingPanel`, `onBookingEvent`, `statsPanels`,
`bulkActions`, `permissions`, `mcpTools`, `busyTimes`.

## Recipe D: a view

- **Kit-wide change**: edit the kit's view in `src/views/pages/...`.
- **One client looks different**: in that client's repo, write the view in
  `theme/views/<name>.tsx` and list it in `theme/views.ts`:

  ```ts
  const views: ViewOverrides = { "site.home": SiteHome };
  ```

  The names are in `src/views/kit.ts`. A client's view gets the same props
  as the kit's and reads data through the same core functions. Clients
  replacing owner-area views (`admin.*`) take kit improvements to those
  screens by hand, so prefer a slot or a setting there.
- A landing page: see `README.md` "Adding a landing page".

## Recipe E: a migration

1. Core: `db/migrations/<next number>_<what>.sql` (the last one is `0014`,
   so the next is `0015`). Extension: `extensions/<id>/migrations/<n>_<what>.sql`.
2. Plain SQL. Additive first: add a column or table; backfill; only a later
   release removes the old thing. Never edit a migration that is in `main`.
3. `enable row level security` on every new table.
4. `pnpm migrate --check` lists it; `pnpm migrate` applies it; run twice to
   prove the runner skips it the second time. CI migrates and seeds twice.
5. A change of seed content: `db/seed/data.json` for structure, each pack's
   `content.json` for text. The seed never overwrites what the owner edited.

## Recipe F: a notification driver or another outside service

Ask the owner of the kit before choosing the provider.

- **New driver on an existing channel**: one file in
  `src/core/platform/notify/drivers/`, implementing `Driver.send()` (returns
  `{ ok, providerRef, costAgorot }` or `{ ok: false, error, retry }`); one
  line in `notify/drivers.ts`; its keys in `DRIVER_KEYS` in
  `src/core/platform/config.ts`; its names in `env.example`; a test with a
  stand-in for the network in `tests/unit/notify.test.ts`.
- **New channel**: add it to `Channel` in `outbox.ts` and the database
  check, to `routing.ts`, and a driver as above. Templates per channel are
  seeded from the packs' `content.json`.
- **Any other service** (payments, Google): an interface in
  `src/core/platform/` (or the extension's `server/` if only it uses it), a
  fake used when `PROVIDERS=fake`, keys that are all-or-nothing in
  `config.ts`, and a `features` flag so the UI hides it when keys are
  missing.

## Recipe G: a language

To the kit: make `languages/<code>/` with `pack.json`, `messages.json`,
`content.json` (and `legal/`), filled from `languages/contract.json`; add
`languages/<code>.json` to every extension that has strings; run
`pnpm lang:check <code>` until nothing is missing. To a client: add the code
to `languages.others` in its `client.json` and run `pnpm brand`.

## Recipe H: a setting the owner changes

Core settings are typed in `src/core/platform/settings.ts`; an extension's
in its manifest's `settings`. Each has a zod type and a default. The owner's
settings screen shows them (`views.tsx` `settings` for an extension). A
setting a client fixes once (not the owner) belongs in `client.json` and
`src/brand.schema.ts` instead.

## Things that look like shortcuts and are not

| Tempting | Do instead |
|---|---|
| `if (client === "sarah")` or checking `hasExtension()` in the core | An extension point |
| Editing `brand.css` or a `*.generated.ts` file | Edit `client.json` or a pack, run `pnpm brand` |
| A query in a route or a view | A read function in the core module |
| Calling a driver or `fetch` to a provider directly | `Notify`, or the service's interface |
| A Hebrew string in a component | A key in every pack |
| `left`/`right`, `ml-`/`pr-` | `start`/`end`, `ms-`/`pe-` |
| `new Date().getHours()` for business time | `src/core/platform/time.ts` |
| Fixing the same bug in two client repos | Fix in the kit, `pnpm kit update` in each |
