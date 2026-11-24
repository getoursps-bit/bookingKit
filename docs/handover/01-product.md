# 01. The product: what we are building and why

## The problem

Small service businesses (a groomer, a brow artist, a physiotherapist, a
jewellery designer who teaches courses) need three things that usually come
from three paid tools: a website, online booking, and a place to run the
day (calendar, customers, messages). Generic booking platforms are expensive
per month, look the same for everyone, handle Hebrew and Arabic badly, and
own the customer data.

## What bookingKit is

One codebase that becomes **each client's own site**:

- **Public site**: home, services, products, gallery, hours, contact,
  landing pages, privacy and accessibility pages. Installable as an app.
- **Online booking**: choose services, choose a free time, prove a phone
  number or email with a 6-digit code, done. A private link (`/b/<token>`)
  lets the customer move or cancel. Reminders go out by WhatsApp, SMS, email.
- **Owner area** (`/admin`, installable as its own app): today, calendar,
  customers, inbox, content (services, products, gallery), hours, settings,
  statistics, and push alerts on the owner's phone.

Each client gets its own repo, database, server and domain. It looks like
that client (colours, fonts, logo mark, wording) and speaks that client's
languages, while sharing one engine.

## How the business works

- **The kit is the product.** You build a feature once in the kit; every
  client takes it with `pnpm kit update`. This is what makes many clients
  affordable to maintain.
- **A new client is made from a blueprint** (a YAML description) in minutes,
  with `pnpm kit new` or the `new-client` skill. The look and the client's own
  wishes are finished in that client's repo.
- **Paid tiers** (planned, step 4 part 9): a licence per client limits staff
  seats and switches on paid modules (for example MCP, connectors, advanced
  statistics, the shop). The free base is the site, booking and owner area.
- **Not only Israel.** Hebrew is the reference language and Israel the first
  market, but the kit must not hard-code one country. Step 4 makes currency,
  time zone and country settings; no country's tax or invoice rules are built
  in.

## Who uses it

| Person | Where | Cares about |
|---|---|---|
| Customer | Public site, booking, private link, messages | Booking in under a minute on a phone, in their language |
| Owner | `/admin` on a phone | Seeing the day, not missing a booking, few taps |
| Staff (planned) | `/admin`, with a role | Doing their part without seeing everything |
| You, the kit developer | The kit repo | One fix reaches every client; nothing client-specific leaks into the kit |
| A client-project agent | A client's repo | Making that client look and behave as wished without touching the core |

## Principles (the "why" behind the rules)

1. **One engine, many clients.** Anything every client needs goes into the
   kit; anything one client needs stays in their repo. That is why the core
   never contains a client's idea and why extensions exist.
2. **Mobile first, right to left first.** Owners and customers are on
   phones; the reference language is Hebrew. Logical CSS and `isolate()`
   exist so that one layout works in both directions.
3. **Boring, safe operations.** One stateless image, two entry points,
   configuration only from the environment, migrations as a separate release
   step, JSON logs. A server agent can run it without knowing the code.
4. **Nothing breaks when a service is missing.** Every outside service sits
   behind an interface with a fake; without keys its feature hides instead of
   failing. A client can launch with no WhatsApp and add it later.
5. **The booking is sacred.** No double booking (enforced by the database),
   no AI deciding a booking, every message through one outbox so nothing is
   lost or sent twice.
6. **Libraries over hand-written code**, except for the booking engine, the
   no-overlap rule and the outbox, which are the product.
7. **Decisions are written down.** A design per step in `docs/designs/`,
   notes per stage in `docs/build-notes.md`, each decision with its date.

## Where it stands (2026-11-24)

Done (steps 1 to 3): the brand in `client.json`; language packs (Hebrew,
English, Arabic) with a translation contract; core / views / extensions,
with `pets`, `approval`, `split-hours`, `ai`, `map-links`, `dibs-import` as
extensions; the notification layer (WhatsApp by Meta or Twilio, email by
HTTPS API, SMTP or Gmail, web push); `pnpm kit new`, `kit status`,
`kit update`; the `new-client` skill.

Clients on the kit: **Vered Beauty** (`~/Containers/veredBeauty`, with its
own `courses` extension) and **Sarah** (`~/Containers/sarah`, with its own
`atelier` extension). Fluffy Fur and Safa Clinic were built before the kit
and are not clones of it; they get no kit updates until they are moved onto
it.

Next (step 4, `docs/designs/step4_owner_platform.md`): the customers list
fix, roles and paid seats, archive and bulk delete, statistics, MCP,
webhooks, more notification channels, Google connectors, and the money
modules (payments recorded by the owner, cash first; a simple accountant;
invoices; a shop).

## Not the goal

- A marketplace or a multi-business platform. One site is one business.
- Full accounting, tax returns or payroll. The accountant module is a cash
  book with export.
- Per-staff calendars (whose diary a booking is in). Possibly later, as its
  own step.
