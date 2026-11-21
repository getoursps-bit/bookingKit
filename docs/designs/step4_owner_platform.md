# bookingKit, step 4: the owner area grows up

Status: draft for approval. Nothing here is built yet.

## Summary

**How clients get the updates.** Every item is built in bookingKit and
reaches each client project with `pnpm kit update`. Changes to the core,
such as the customers-list fix, arrive straight away. Features only some
clients want, like the shop or the Google connectors, are built as
extensions: they arrive switched off, and each client turns them on in its
own `client.json`. Sarah and Vered have replaced only public-site pages,
never owner-area pages or core files, so this work merges into both without
conflicts. Vered is one kit commit behind and is updated first.

**Found in the code (2026-11-18).**

- The customers page queries only when there is a search term, and an empty
  search returns nothing. The fix is a paged list of every customer, with
  search as a filter (part 1).
- There are no invoices or orders in the kit yet; products are ordered by a
  click to WhatsApp. Invoices and orders arrive with the `invoices` and
  `shop` modules (part 7), and can be deleted one at a time or in bulk from their first day (part 2). The
  kit is not made mainly for Israel, so no country's invoice-keeping rule is
  built in; a client that needs one switches on `invoices.lockAfterDays`.
- The `staff` table has no roles: anyone who can sign in can do everything.
  Roles and permissions come before delete, MCP and connectors (part 9).
- MCP meets the rule "AI never blocks or changes a booking". Part 4 proposes
  new wording; MCP ships read-only until it is decided.
- Amounts, the time zone and phone numbers assume Israel; they become
  `client.json` settings before the money modules (part 7).

**Core and modules.** Only customers, bookings, services, hours, the
website's content and the platform (staff, settings, messages) are core.
Payments, accounting, invoices, the shop, courses, MCP, webhooks, the
connectors and extra channels are modules: each is switched on per client,
works with the core's entities through fixed points, and has its own spec in
`extensions/<id>/SPEC.md`.

**Money.** Payment starts as cash: the owner records each payment and the
system shows each booking's status (unpaid, partly paid, paid). Beside it
is a simple accountant: income from the payments, expenses the owner types,
profit, money owed, and export. Online payment comes later as a driver of
the same module.

**Order.** 1. Customers list. 2. Roles, inviting admins, paid seat limit.
3. Archive and bulk actions. 4. Statistics. 5. MCP, read-only first.
6. Outgoing webhooks (n8n and through it most other apps). 7. Notification
channels. 8. Google Calendar, Sheets, Drive. 9. Currency, time zone and
country; then payments, accounting, invoices, courses and the shop.

**Open decisions** are listed at the end of this document.

## For the developer taking this over

Read first, in this order: the kit's `CLAUDE.md` (the rules),
`docs/designs/step2_modules_languages.md` (core, views, extensions and how
an extension is wired), `src/extension/types.ts` and
`src/extension/views.ts` (the extension points that exist today), and the
last two sections of `docs/build-notes.md` (`kit new` and `kit update`).

How to work:

- Build in this repo only, never in a client's project. Clients take each
  stage with `pnpm kit update`.
- Follow the order of work below. Stage 1 (the customers list) needs no
  decision and can start at once. A stage that depends on an open decision
  (end of this document) waits for the owner of the kit's answer; ask, do
  not choose a provider or a paid service yourself.
- A module starts with its `extensions/<id>/SPEC.md`, using the nine
  headings in "Core and modules", agreed before its code is written.
- A new extension point is added to the core only when the first module
  needs it, with a test, and the core never names a module.
- A stage is done when `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:e2e` and `pnpm build` pass for the default client and the
  sample clients (`scripts/with-client.sh`), and a short note is added to
  `docs/build-notes.md`. Then commit; one stage, one merge into `main`.
- When a decision is made, write it into this document under the part it
  belongs to, with the date, and remove it from "Decisions needed".

## Context

A client (Sarah) sent a list of fixes and requests. None of them is hers
alone: every client's owner needs to find a customer, remove a mistake, see
how the business is doing, and let a helper sign in. So all of it is built
**in the kit**, and every client project takes it with `pnpm kit update`.

How each request reaches the clients:

| Kind of change | Where it is built | What a client gets on `pnpm kit update` |
|---|---|---|
| Core fix or core feature | `src/core`, `src/views`, `db/migrations` | It at once, after `pnpm migrate` |
| New extension | `extensions/<id>/` | The code and its tables, **switched off**. The client turns it on in `client.json` and runs `pnpm brand` |
| New outside service | A platform interface with a fake, plus a driver | Nothing changes until that client's server has the keys |
| Paid feature | Core or extension, behind the licence (part 9) | It works only when the client's licence allows it |

Checked on 2026-11-18: Sarah and Vered replace only public-site views
(`site.*` in `theme/views.ts`), never an owner-area view, and neither changed
a core file. Owner-area work therefore merges into both without conflicts.
Vered is 1 kit commit behind and Sarah 0; both should be brought level
before this step starts.

Rules from `CLAUDE.md` that shape this step:

- An idea one client has is an extension, never an `if` in the core.
- Every outside service sits behind an interface with a fake.
- **AI never blocks or changes a booking.** Part 4 (MCP) touches this rule,
  so it needs a decision first.
- Ask before choosing a provider or adding a paid service. Parts 5, 7 and 8
  each need one.

## Core and modules

Decided by the owner of the kit on 2026-11-18: only what makes the system a
booking system and a website is core. Everything else is a **module**,
switched on per client and described by its own spec. ("Module" here is
what the code calls an extension: a folder `extensions/<id>/`.)

### What is core

| Core module | Its entities |
|---|---|
| Booking | Customer, booking (appointment) and its lines, service, opening hours, day off |
| Website | Business profile, pages, gallery, product catalogue |
| Platform | Staff and their roles, settings, messages (`Notify`), translation, stored files, audit log, events |

The core never knows a module exists. A module reads core entities through
the core's read functions, changes them only through core actions, and
reacts to core events. It keeps its own data in its own tables
(`ext_<id>_*`) that point at core rows (a payment points at a booking and a
customer), never the other way round.

### The modules of this step

| Module | What it is | Needs | Status |
|---|---|---|---|
| `payments` | Payments recorded by the owner (cash first), payment status of bookings and orders | — | New |
| `accounting` | Income, expenses, profit, money owed, export | `payments` | New |
| `invoices` | Numbered receipts and invoices as PDFs | `payments` | New |
| `shop` | Cart, checkout, orders, stock | `payments` | New |
| `courses` | Courses with dates, seats and sign-ups | (`payments` if paid) | Moves in from Vered's repo |
| `stats-advanced` | The statistics of part 3 beyond the basic screen | — | New |
| `mcp` | Control through an AI assistant | — | New |
| `webhooks` | Core and module events posted to n8n, Zapier, Make | — | New |
| `google-calendar`, `google-sheets`, `google-drive` | Connectors | `connectors` (platform) | New |
| `sms`, `telegram`, … | Notification channels | — | New drivers of `Notify` |

Already modules: `pets`, `approval`, `split-hours`, `ai`, `map-links`,
`dibs-import`.

Stays in the core in this step: the customers list fix (part 1), roles and
seats (part 9), archive and bulk actions (part 2), the basic statistics
screen, and the `connectors` token store.

### Each module has its own spec

Every module has `extensions/<id>/SPEC.md`, written before it is built and
kept current. It is where its behaviour is controlled, not this document.
Each spec has the same headings:

1. **Purpose**: one paragraph.
2. **Uses from the core**: entities read, actions called, events heard.
3. **Its own data**: tables and what each row means.
4. **Screens and slots**: owner screens, and what it adds to core pages.
5. **Settings**: each one with its default; what is a setting in
   `client.json` and what the owner changes in the owner area.
6. **Permissions**: what each role may do (part 9).
7. **Messages**: kinds sent through `Notify`.
8. **Needs and paid**: the modules it needs; whether it is a paid feature.
9. **Not included**: what it deliberately does not do.

`pnpm kit new` lists the modules from these specs, and the blueprint picks
them, as it picks extensions today.

### Extension points this step adds to the core

The modules above need a few points the core does not have yet. Each is
added when the first module needs it:

| Point | What it allows | First user |
|---|---|---|
| `bookingPanel` (view slot) | Content on a booking in the calendar and the today page | `payments`: "Mark paid" |
| `onBookingEvent` | React after a booking is made, moved, done, no-show or cancelled; cannot change the outcome | `payments`: "paid?" on done; `webhooks`, `google-calendar` |
| `statsPanels` | Panels on the statistics screen | `accounting`, `shop` |
| `bulkActions` | Its own list with the bulk pattern of part 2 | `payments`, `shop`, `invoices` |
| `permissions` | Its permissions, given to roles | Every module |
| `mcpTools` | Its tools on the MCP server | `payments`, `shop` |
| `busyTimes` | Times that are not free | `google-calendar` |

## The requests, where each one lives

| # | Request | Layer | Size | Needs a decision |
|---|---|---|---|---|
| 1 | The customers page lists nobody until you search | Core view | ½ day | No |
| 2 | Delete, one at a time and many at once | Core, plus a point for extensions | 3 days | Yes: delete or archive |
| 3 | Better statistics | Core, plus a point for extensions | 4 days | No |
| 4 | Control the site through MCP | Platform | 1 week | **Yes: the AI rule** |
| 5 | More notification channels | Platform drivers | 3 days per channel | Yes: which channels and providers |
| 6 | Other improvements to behaviour and content | Not yet known | — | Need Sarah's list |
| 7 | Payments (cash first), a simple accountant, invoices, a shop | Modules `payments`, `accounting`, `invoices`, `shop` | 1 + 1 + 1 + 3 weeks | Online payment provider only later |
| 8 | Connect Google Calendar, Sheets, Docs and others | Platform `connectors` + extensions | 1 week, then 3–5 days each | Yes: Google project setup |
| 9 | More than one admin, roles, and a paid seat limit | Platform | 1 week | Yes: how a limit is enforced |

## 1. The customers page lists nobody (bug)

Today `views/pages/admin/customers.tsx` calls `searchCustomers()` only when
`q` is set, and `searchCustomers("")` returns nothing. The page is empty
until the owner types.

Fix, in the core:

- `listCustomers({ q, sort, page })` in `core/booking/owner-data.ts`: every
  customer who is not erased, 50 to a page, newest visit first by default;
  `q` filters the same list by name or phone as today.
- Columns: name, phone, number of bookings, last visit, next booking.
  Sort by name, last visit or number of bookings.
- Paging with plain links (`?page=2`), so it works without JavaScript like
  the rest of the owner area.
- An index on `appointments (customer_id, starts_at)` if the query needs it.
- A browser test: a seeded customer appears on the page without a search.

This goes first, on its own, so clients get it within the week.

## 2. Delete, one and many

What exists today:

| Thing | Today | Note |
|---|---|---|
| Booking (appointment) | Cancel, done, no-show. No delete | Cancelled bookings stay in the calendar and the customer's history |
| Day off (`time_off`) | Delete one at a time from the hours screen | |
| Customer | Merge, export, erase (privacy) | Erase already removes the personal data |
| **Order, invoice** | **Do not exist in the kit** | Products are ordered by a WhatsApp click. They arrive with the `invoices` and `shop` modules (part 7) |

Proposal:

- **Bookings are archived, not deleted.** A new `archived_at` column hides a
  cancelled, past or no-show booking from the calendar, lists and
  statistics. It stays in the audit log and can be restored for 30 days.
  The worker then deletes it for good. A booking that still holds a time
  must be cancelled first (the customer is told), so a delete can never
  bypass the cancellation message or the no-overlap rule.
- **Days off** get bulk delete on the hours screen.
- **Invoices and orders can be deleted**, one at a time and in bulk, like
  bookings. Decided by the owner of the kit on 2026-11-18: the kit is not
  made mainly for Israel, so no one country's tax rules are built in. They
  arrive with the `invoices` and `shop` modules (part 7), which use this
  same delete and bulk pattern from their first day.
  - Deleting an invoice deletes the kit's copy (its row, number and PDF
    link). An invoice issued by an outside invoice service stays in that
    service; the kit asks that service to void or delete it where its API
    allows, and says so when it does not.
  - An order that was paid can be deleted; deleting it does not refund it.
    Refunding is its own action, done first if wanted.
  - For a client in a country that requires keeping invoices, one setting,
    `invoices.lockAfterDays` (empty by default, so off), blocks deleting an
    invoice older than that and offers a credit note instead. It is a
    client's choice in `client.json`, not a rule in the core.
- **Bulk actions are one core pattern**, not code per screen: a list view
  gets check boxes and an action bar (cancel, archive, restore, export).
  The server action takes a list of ids, checks each one, runs them in one
  transaction, and writes one audit entry each. A new extension point,
  `bulkActions`, lets an extension (shop: orders) add its own list to the
  same pattern.
- Every delete or archive asks for confirmation, names how many items, and
  is allowed only to roles that have the permission (part 9).

## 3. Advanced statistics

`core/stats.ts` already counts bookings, visits, clicks, messages and
sources. Add:

- **Money**: expected and completed income, from each line's service price.
  Average per visit. Income by service and by month.
- **Customers**: new against returning, how many come back within 60 or 90
  days, the top customers, customers who have not been back for a while
  (a list the owner can message).
- **Time**: a weekday × hour heat map of bookings, how full the opening
  hours were (booked minutes ÷ open minutes), how far ahead people book.
- **Losses**: no-show and cancellation rate, and how close to the time
  cancellations come.
- A free date range besides 7 / 30 / 90 days, comparison with the period
  before, and CSV export of any table.
- Charts with one well-known library (Recharts, MIT), drawn from the brand
  colours.
- Extension point `statsPanels`: the shop adds sales, courses add sign-ups.

Advanced panels can be a paid feature (part 9); the basic screen stays for
everyone.

## 4. MCP: running the site from an AI assistant

An MCP server inside the app, so the owner can say to Claude (or any MCP
client) "what do I have tomorrow", "block next Friday", "who hasn't been back
since the summer".

- Endpoint `/api/mcp` with the official `@modelcontextprotocol/sdk`
  (Streamable HTTP). Same container, no new service.
- Sign-in: a personal access token the owner makes in the settings, tied to
  one staff member and their role, with a scope (`read`, `write`), shown
  once, stored hashed, revocable, with last-used time.
- Tools are thin wrappers over the **existing core actions**, never SQL:
  bookings in a range, free times, customers (list, search, record), days
  off, statistics, message templates. Write tools: book, move, cancel,
  add a day off, edit a customer note.
- Every call is written to the audit log with actor `mcp` and the staff
  member, and rate limited.
- Extension point `mcpTools`: an extension adds its own tools (shop: orders).

**Decision needed.** `CLAUDE.md` says AI never blocks or changes a booking.
That rule is about the site's own AI (photo analysis, summaries). An MCP
assistant acts for a signed-in person who asked for the change. Proposed
wording: *"The site's own AI never blocks or changes a booking. An assistant
connected by MCP acts as the staff member whose token it uses, with that
person's permissions, and its write tools ask for confirmation in the
client."* Until that is agreed, MCP ships read-only.

## 5. More notification channels

Today: messaging (WhatsApp by Meta or Twilio), email (HTTPS, SMTP, Gmail),
web push to the owner's devices. Everything goes through `Notify`, so a new
channel is a driver and a route, not a change in booking code.

Candidates, in the order proposed:

1. **SMS as its own channel**, not as WhatsApp's stand-in: for customers
   without WhatsApp and as a fallback when a WhatsApp message fails. Needs an
   Israeli sender (Twilio, or a local provider such as 019 or InforU).
2. **Push to customers** (the column already exists in
   `push_subscriptions`): reminders without paying per message, for
   customers who installed the site as an app.
3. **Telegram** to the owner: a free, instant channel for the owner's own
   alerts.
4. **Routing rules the owner sets**: per message kind, which channels and in
   what order; reminder times (for example 24 hours and 2 hours before);
   quiet hours.
5. **A daily summary** to the owner each morning.

Each new channel costs money per message only where its provider does.
The choice of providers is the owner's.

## 6. Other behaviour and content improvements

The request says "other enhancements she mentioned" without a list. Before
this part is planned, Sarah's list is needed in writing. Each item is then
sorted with the same table: core if every client wants it, an extension if
only some do, Sarah's own repo if only she does.

## 7. Money and selling: four modules

Decided by the owner of the kit on 2026-11-18:

- Money is **not core**. Payments, accounting, invoices and the shop are
  modules (extensions) that work with the core's entities but are not part
  of them. A client switches each one on or off in `client.json`, and each
  has its own spec (see "Core and modules" below).
- **Payments start as cash.** The customer pays in person, and the owner
  records it in the system. Paying online is a later driver of the same
  module, not a different module.
- The owner needs a **simple accountant** beside the bookings: what came
  in, what went out, and what is still owed.

The four modules, in build order. Each needs the one above it.

### `payments`: who paid what, recorded by the owner

- A **payment** belongs to a booking, an order or just a customer: amount,
  method (cash, bank transfer, card on the spot, other; the list is a
  setting), date, note, and the staff member who recorded it.
- A booking or order then has a **payment status**: unpaid, partly paid,
  paid, refunded. The amount due comes from the services' prices, and the
  owner can change it (discount, extra).
- Where the owner sees and changes it:
  - on each booking in the calendar and on the today page: "Mark paid"
    (one tap, cash, full amount) or "Record payment" (amount and method);
  - on the customer record: the payments, and what the customer still owes;
  - a payments screen: every payment in a date range, filters by method and
    status, edit, delete one or many (part 2's bulk pattern).
- When a booking is marked done, it can ask "paid?" so nothing is forgotten
  (a setting, on by default).
- A refund is a negative payment with a reason.
- **Later, online payment**: the platform interface `Payments` with a fake
  driver, like messaging. The first real driver is an international one
  (Stripe or PayPal); local ones are added when a client needs them. The
  payment page is the provider's, so card numbers never touch the site. An
  online payment is recorded by the driver in the same table, so everything
  below works the same.

### `accounting`: the simple accountant

Needs `payments`. It is a cash book, not a full accounting system.

- **Income** is read from the payments; nothing is typed twice.
- **Expenses** are typed by the owner: date, amount, category (rent,
  materials, marketing, …; the list is a setting), supplier, note, and an
  optional photo of the receipt (through the existing photo storage).
- **Screens**: a month at a glance (income, expenses, profit), income by
  service and by method, expenses by category, the year by month, and
  "owed to you" (bookings and orders not fully paid).
- **Export** to CSV for the client's own accountant; with the Sheets
  connector (part 8), a sheet kept up to date.
- Everything can be edited and deleted, one or many.
- Not included: tax returns, VAT reports, double-entry bookkeeping, payroll.
  A client who needs those exports to their accountant's software.

### `invoices`: documents for payments

Needs `payments`.

- From one payment, or several of a customer's, the owner makes a numbered
  document (receipt or invoice) as a PDF in the client's languages, with
  the business details from the profile, and sends it through `Notify`.
- Numbering, prefix and the document's wording are settings. Tax lines
  (rate, tax number) are optional settings, so no country's rules are built
  in.
- Drivers behind an interface `Invoices` with a fake: the kit's own PDF
  first; outside invoice services as clients need them.
- Invoices can be deleted, one or many, as part 2 describes, with the
  optional lock `invoices.lockAfterDays` for a client that must keep them.

### `shop`: selling products

Needs `payments`. It replaces the WhatsApp order click when switched on.

- **Products** already exist in the core catalogue. The shop adds stock,
  variants (size, metal), and "sold out".
- **Cart and checkout**: a cart kept in a cookie, checkout with name and
  phone (proven with the same code as a booking), delivery or pickup.
  Payment is cash on pickup or delivery until online payment is added.
- **Orders**: tables `ext_shop_orders`, `ext_shop_order_lines`; statuses
  new, ready, sent, collected, cancelled. Whether it is paid is the
  `payments` module's status. An orders screen with the bulk actions from
  part 2, including delete.
- **Messages**: order received, ready, sent; through `Notify`.
- **Courses** (Vered already has a `courses` extension; Sarah sells
  courses): Vered's `courses` moves into the kit first, so both share one.
  A course sign-up is paid through `payments` like a booking.

**Not only Israel.** Selling to other countries needs the kit to stop
assuming Israel. Found on 2026-11-18: amounts are stored as "agorot" (22
files), the time zone is fixed to Asia/Jerusalem (`platform/time.ts`), and
phone numbers assume +972. Before the shop, a short stage makes these
`client.json` settings: `currency` (amounts stored in the currency's minor
unit), `timeZone`, and `country` for phone numbers (with
libphonenumber-js, as step 2 already planned). Existing clients keep
today's behaviour because the defaults are ILS, Asia/Jerusalem and IL.
`CLAUDE.md`'s time rule then says "the client's time zone" instead of
Asia/Jerusalem.

## 8. Connectors: Google and other apps

A platform module `connectors` holds each connection's tokens (encrypted,
key from the environment), its status and its last error. Each connector is
an extension, so a client switches on only what it uses. All sync work runs
in the worker from the events the core already raises, never inside a
booking.

| Connector | What it does | Notes |
|---|---|---|
| **Outgoing webhooks** | Posts every core event (booked, moved, cancelled, order paid) to a URL, signed | Covers n8n, Zapier and Make, so "any other app" works on day one. Build first |
| **Google Calendar** | Each booking appears in the owner's calendar. Optional: busy times in her calendar block online booking | Blocking needs a new availability point, `busyTimes`. A failed sync never blocks a booking |
| **Google Sheets** | A sheet of bookings and customers, kept up to date, or a one-click export | |
| **Google Docs / Drive** | Invoice and order PDFs saved to a Drive folder | Docs itself has little to offer a booking site; Drive is the useful half |
| Later | iCal feed (read-only, no Google sign-in), Mailchimp or Brevo customer lists, Meta catalogue for the shop | |

**Decision needed.** Google sign-in needs a Google Cloud project with an
OAuth screen. One shared project for all clients is less work but must pass
Google's verification for calendar scopes; one per client avoids that but
must be set up per client.

## 9. Admins, roles and a paid seat limit

Today the `staff` table has no role: everyone signed in can do everything.

- **Roles**: owner (everything, including staff and billing), manager
  (everything except staff and the licence), reception (calendar, customers,
  bookings, no settings, no delete, no statistics), viewer (read only).
  Stored as a role per staff member; the permissions of each role are a
  fixed list in the code, so they are tested.
- **Permissions are checked on the server** at every owner action and page,
  and on MCP and `/api/ext` actions, through one function
  `can(staff, "bookings.archive")`. The navigation hides what a role cannot
  use. Extensions declare their permissions in their manifest.
- **Inviting**: the owner enters an email and a role; the person gets a link
  and signs in with the existing email code and password. The owner can
  change a role, sign someone out of every device, or remove them.
- **The seat limit (paid)**: each client has a **licence**, a signed token
  in an environment variable (`KIT_LICENCE`), checked with the kit's public
  key. It says how many staff seats the client has and which paid features
  are on (for example `mcp`, `connectors`, `stats.advanced`, `shop`). A
  client cannot raise it by editing settings or the database, because the
  signature would not match. Without a licence a site runs with one seat and
  the free features.
- Inviting past the limit shows "your plan has N seats" with how to upgrade.
- Charging for it stays manual at first (an invoice from you); the licence
  is reissued when a client upgrades.

**Decision needed.** The licence above, or a simpler number in the
environment (`STAFF_SEATS=3`). The number is enough as long as only you deploy
clients' servers; the licence matters once a client or another developer
can change the server's settings.

## Order of work

Each stage ends with the suite passing for the default client and the sample
clients, a note in `docs/build-notes.md`, and a kit commit that the client
projects can take.

| Stage | Parts | Why in this order |
|---|---|---|
| 0 | Bring Vered level with the kit | So every client starts from the same commit |
| 1 | 1 (customers list) | A bug. Ship it alone, then `pnpm kit update` in each client |
| 2 | 9 (roles, invites, seats, licence) | Delete, MCP and connectors all need permissions |
| 3 | 2 (archive and bulk actions) | Needs roles. Builds the bulk pattern the shop reuses |
| 4 | 3 (statistics) | Core only, no outside service |
| 5 | 4 (MCP, read-only first) | Needs roles and tokens |
| 6 | 8a (outgoing webhooks) | Cheap, and opens every other app through n8n |
| 7 | 5 (channels) | After providers are chosen |
| 8 | 8b (Google Calendar, Sheets, Drive) | After the Google project is decided |
| 9a | Currency, time zone and country in `client.json` | Money must not assume Israel |
| 9b | `payments` (cash, recorded by the owner) | The base of every money module |
| 9c | `accounting` | The simple accountant; needs only `payments` |
| 9d | `invoices` | Needs `payments` |
| 9e | `courses` into the kit, then `shop` | The largest |
| later | Online payment driver for `payments` | After the provider is chosen |
| — | 6 (Sarah's other requests) | Planned when her list arrives |

After each stage, in each client project: `pnpm kit update`, `pnpm migrate`,
the checks, then that client's own release. A client that wants a new
extension also adds it to `client.json` and runs `pnpm brand`.

## Decisions needed before building

1. **Delete**: archive with 30 days to restore and then delete for good
   (proposed), or delete at once? (Invoices and orders: decided, they can be
   deleted; see part 2.)
2. **MCP and the AI rule**: accept the wording in part 4, or keep MCP
   read-only?
3. **Notification channels**: which of SMS, customer push, Telegram, and
   which SMS provider?
4. **Online payment**: which provider, when a client needs it. (Cash
   recorded by the owner is decided and comes first.)
5. **Google**: one shared Google Cloud project, or one per client?
6. **Seat limit**: signed licence or a plain number in the environment?
   How many seats in each plan, and which features are paid?
7. **Part 6**: Sarah's list of other improvements.

## Not in this step

- Several businesses or branches in one site (each client is still one
  business with its own server and database).
- Several staff calendars (bookings per staff member). Roles here are about
  who may sign in, not whose diary a booking is in. If a client needs
  per-staff booking, that is a step of its own.
- Taking payment for bookings (deposits). The `Payments` interface from part
  7 makes it possible later as an extension.
