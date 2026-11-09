# Fluffy Fur Build Brief: Scope, Architecture, Infrastructure

> **Note:** This is the original build brief, saved as given on 2026-10-26.
> Where it conflicts with [the design](designs/fluffy_fur.md) or
> [the concept brief](../concepts_brief.md), the design wins. Main
> differences: AI features, several pets per booking, WhatsApp as the message
> channel with an email fallback, owner browser alerts, and products ordered
> through WhatsApp. Tables below were flattened when the brief was pasted;
> their rows are kept in order.

Oct 26, 2026 · @Khalil

## Summary

Build Fluffy Fur as the salon's own Hebrew, right-to-left booking website: customers browse services, products and hours, book an appointment with phone verification, and manage it later; the owner runs the salon from a small admin area. It replicates what the salon's current Dibs page does, as an app the salon controls.

Where it runs. One Docker container (plus an optional worker) on your own Contabo VPS, behind the existing Traefik proxy, at flfy.gtechvps.dev as a password-gated client showcase now and as production on the same server later. Data lives in the fluffyfur schema of your self-hosted Supabase. Releases go out through the existing ffctl deploy <tag> tool.

What a build session must deliver

1. A version 1 app image that meets the container contract in section 7 and deploys and rolls back with ffctl.
2. The fluffyfur schema as versioned migrations, with seed data from section 3 and row-level security on every table.
3. The customer booking flow and the owner admin listed as version 1 in section 2.
4. Confirmation and reminder messages, behind a provider interface so the provider can be chosen late.
5. Hebrew right-to-left pages that meet the Israeli accessibility standard (IS 5568, WCAG AA).
6. A test suite and a CI pipeline that builds, tests and pushes the image.

Server hardening (backups, monitoring, Supabase permissions) is handled on the server side and is not part of the build; the app only has to work with it as described in section 7.

## Scope

The functions come from the discovery document, which lists 25 functions observed on the Dibs page or inferred from it. "Observed" items were seen on the page; "inferred" items are what a salon owner needs behind it.

| Area | Function | Version | Notes |
| :--- | :------- | :------ | :---- |
| Public pages | Business page: logo, cover, name, tagline, city, phone | 1 | Hebrew, right-to-left |
| Public pages | Contact shortcuts: call, WhatsApp, Waze, Instagram, Facebook, TikTok | 1 | Link targets to be supplied by the owner |
| Public pages | Photo gallery (38 photos on Dibs) | 1 | Needs the original image files |
| Public pages | Tabs: services, working hours, products | 1 | |
| Public pages | Service list with "from" prices and durations | 1 | Final price is set at the salon |
| Public pages | Product catalog (8 items), display only | 1 | No cart or checkout seen on Dibs |
| Booking | Step 1: pick one or more services | 1 | Multi-select, duration summed |
| Booking | Step 2: weekly day strip with a status per day | 1 | Statuses: available, closed, full |
| Booking | Slot list for the day, plus a "first available" view | 1 | |
| Booking | Step 3: phone verification by one-time code | 1 | Method assumed (SMS or WhatsApp); to confirm |
| Booking | Step 4: confirmation | 1 | |
| Booking | Manage my appointment: view, cancel, reschedule | 1 | Through a secure link, no account needed |
| Booking | Online payment through Grow | 1.1 | Starts when the provider account exists |
| Booking | Waitlist for full days | 1.1 | Dibs requires its app for this; build as a message-based waitlist |
| Owner admin | Calendar with day and week views | 1 | |
| Owner admin | Working hours and blocked time (events, holidays) | 1 | Replaces the Wednesday 10:00–10:05 workaround |
| Owner admin | Add, edit, remove services, products, profile, gallery, links | 1 | |
| Owner admin | Customer records: name, phone, history, notes | 1 | |
| Owner admin | Book, cancel and move appointments for a customer | 1 | |
| Messages | Confirmation and reminder messages | 1 | Provider chosen late, behind an interface |
| Platform | Accessibility: built into the pages, not an overlay | 1 | IS 5568, WCAG AA |
| Platform | Language switch | 1 | Hebrew only at launch; text kept in translation files so other languages can follow |
| Platform | Campaign tracking: capture UTM tags from the Instagram link | 1 | Store on the booking |

Out of scope for now: a product shop with cart and checkout, a mobile app, customer accounts with passwords, multiple staff members and branches, loyalty or marketing campaigns.

## Content

Seed these into the database from a script, so the owner can edit them in the admin afterwards. All data was read from the live Dibs page.

### Services (prices in ILS are "from" prices; the final price is set at the salon)

| Service (Hebrew name) | Includes | Duration | Price |
| :-------------------- | :------- | :------- | :---- |
| Cat (חתול) | Shave or trim, nail cut, teeth cleaning, eye and ear area, bath if needed | 50 min | from 200 |
| Cat shave under sedation (גילוח לחתול בטשטוש) | Same as above | 15 min | 300 |
| Dog under 10 kg (כלב - גזע קטן עד 10 קילו) | Haircut, bath, intimate-area shave, nails, paws, ears and eyes | 1 h 20 min | from 220 |
| Dog over 10 kg (כלב - גזע גדול מעל 10 קילו) | Same as above | 1 h 40 min | from 300 |
| Puppy care (טיפוח גורים) | Up to 6 months: bath, brushing, paw and face trim, nails, ear fur removal | 50 min | from 200 |
| Nail trim (גזיזת ציפורניים) | Nails only | 10 min | from 30 |

### Products (display only)

| Product (Hebrew name) | What it is | Price |
| :-------------------- | :--------- | :---- |
| Conditioner (מרכך) | Detangling, moisturizing, dogs and cats | 69.90 |
| Hypoallergenic shampoo (שמפו היפואלרגני) | For sensitive skin, dogs, cats, puppies | 79.90 |
| No-rinse shampoo (שמפו ללא שטיפה) | Cats and kittens, 220 ml, baby-powder scent | 79.90 |
| Dry-skin paw balm (משחה למניעת יובש וטיפול בסדקים) | Nose and paw care | 59.90 |
| FUR DE LUXE perfume oil | 10 ml, musk | 39.90 |
| Fluffy Fresh perfume oil | 10 ml, baby-powder scent | 39.90 |
| PawFume No.4 perfume oil | 10 ml, oriental floral | 39.90 |
| Grooming kit (ערכת טיפוח לכלב ולחתול) | Shampoo, conditioner, perfume, balm | 239.90 |

### Working hours

| Day | Hours |
| :-- | :---- |
| Sunday | 12:00 to 19:00 |
| Monday, Tuesday, Thursday, Saturday | 09:00 to 16:00 |
| Wednesday | 10:00 to 10:05 on Dibs, likely a placeholder for "closed"; confirm with the owner |
| Friday | Closed |

Still needed from the owner: the 38 original gallery photos, logo and cover image, the link targets for the six contact icons, the real Wednesday hours, the salon's address and phone number, and the exact Hebrew wording for the business tagline.

## Architecture

Customers and staff reach only Traefik, which passes pages and API calls to fluffyfur_web. The web container writes bookings to the fluffyfur schema and images to storage; the worker reads the message outbox and is the only part that talks to the message provider. Payment callbacks come back through Traefik. Releases arrive from CI through ffctl.

## Tech stack

The server decides much of this: the app must be one stateless container with server-side code, because payment callbacks, one-time codes and message sending cannot live in the browser. The defaults below fit that; each is a proposal to confirm before the first commit.

| Layer | Proposed default | Why |
| :---- | :--------------- | :-- |
| Language | TypeScript, strict mode | One language for pages, server code and the worker |
| App framework | Next.js (App Router) built as a standalone Node server | Server-rendered Hebrew pages load fast and index well; one container serves pages and API routes |
| Styling | Tailwind CSS with logical properties (start/end, not left/right) | Right-to-left layout works without separate styles |
| Database access | Server-side Postgres client with a repository layer; schema fluffyfur only | Keeps the data layer swappable, see "Database access" in section 7 |
| Validation | Zod on every input and every webhook body | One schema per route |
| Migrations | Plain SQL files applied in order, tracked in a table | Reviewable, no tool lock-in |
| Staff login | Own email-and-password login in the app, hashed passwords, secure cookies, optional second factor | Does not depend on the shared Supabase Auth |
| Worker | Same repository, separate entry point, own container | Sends reminders from a database outbox; no extra queue service |
| Tests | Vitest for logic, Playwright for the booking flow in Hebrew | The booking flow is the product |
| CI | GitHub Actions building an image tagged with the commit | Matches the server's pull-by-tag release tool |
| Registry | GitHub Container Registry | Free for private images at this size; read-only pull token on the server |
| Logging | JSON lines to standard output | The server already rotates container logs |

Rules for the build

- No latest tags, no build steps on the server, no secrets in the image.
- Every time is stored in UTC and shown in Israel time (Asia/Jerusalem).
- Every page works without JavaScript for reading content, and with a keyboard for booking.

## Data model

All tables live in the fluffyfur schema. One table orders already exists there with no rows; its origin is unknown, so confirm before reusing or dropping it.

| Table | Holds | Key rules |
| :---- | :---- | :-------- |
| business_profile | One row: name, tagline, city, phone, address, social links, logo, cover | Edited in admin |
| gallery_images | Image reference, caption, sort order | Files in object storage, not in the database |
| services | Hebrew name, description, duration in minutes, "from" price, active flag, sort order | Price is a hint; final price is set at the salon |
| products | Hebrew name, description, price, image, active flag, sort order | Display only |
| opening_hours | Weekday, open time, close time, closed flag | Local time, Israel |
| time_off | Start, end, reason | Holidays, events, sick days; blocks booking |
| customers | Name, phone in E.164 form (+972…), notes, message consent | Unique on phone |
| appointments | Customer, start and end in UTC, status, notes, manage-link token hash, UTM tags, created time | Status: pending, confirmed, cancelled, completed, no-show |
| appointment_services | Appointment, service, price and duration copied at booking time | History survives later price edits |
| verification_codes | Phone, code hash, expiry, attempts | Short-lived; cleaned daily |
| message_outbox | Appointment, kind, channel, send time, status, attempts, provider reference, error | The worker sends from here; safe to retry |
| staff | Email, password hash, role, second-factor secret | Admin only |
| payments (version 1.1) | Appointment, provider, amount, status, provider reference, raw event | One row per provider event, handled once |
| audit_log | Who changed what and when | Appointments, services, hours, staff |

Rules the database enforces

1. Two confirmed appointments cannot overlap. Use a time-range exclusion constraint, not only app logic. How many appointments can run at once (one groomer or several) is open; start with one.
2. Free slots are computed from opening hours, minus time off, minus existing appointments, using the total duration of the chosen services. Slot start times step in 15-minute increments (assumed).
3. Row-level security is on for every table. The app connects with its own restricted role that has rights only on fluffyfur. No broad rights for the public roles.
4. Prices and durations on a booking are copied from the service at booking time.
5. A pending appointment that is not verified within 10 minutes is released.
6. Personal data (name, phone) is deleted or anonymised on request, and verification codes are deleted after one day.

## Infrastructure contract

The app must follow these server rules. They come from the server's own audit and handover; the server side changes them, not the build session.

### The host

| Item | Value |
| :--- | :---- |
| Server | Contabo VPS gtechvps, Ubuntu 24.04, 6 vCPU, 11.7 GB RAM, Docker and Compose |
| Neighbours | Supabase, n8n, a WordPress dev site (shared server) |
| Hostname | flfy.gtechvps.dev (showcase). The client's own domain comes later |
| Proxy | Traefik v3, label-based routing, automatic Let's Encrypt certificates |
| App folder | ~/Containers/fluffyfur with compose.yml, compose.override.yml, .env, bin/ffctl |
| Web container | fluffyfur_web: 512 MB RAM, 1 CPU, log rotation, restart unless stopped, TZ=Asia/Jerusalem |
| Worker container | fluffyfur_worker: 256 MB RAM, 0.25 CPU, on fluffyfur-net only; prepared but switched off |
| Networks | proxy (shared, reaches Traefik and Supabase's gateway supabase-envoy:8000) and fluffyfur-net (private) |

### Container contract (what the image must do)

1. Listen on one HTTP port, stateless, no local files that must survive a restart.
2. Answer 200 on a health path (for example /healthz) within 60 seconds of starting.
3. Read all configuration from environment variables; no secrets inside the image.
4. Use immutable tags (a version or commit SHA), never latest.
5. Run as a non-root user, handle SIGTERM to shut down cleanly, and write JSON logs to standard output.
6. Stay within 512 MB RAM at normal load, and start without running migrations on its own; migrations run as a separate release step.

### Environment variables (names only; values are set on the server)

| Variable | Purpose |
| :------- | :------ |
| APP_BASE_URL | Public address used in links and messages |
| DATABASE_URL | Restricted role connection (see "Database access") |
| SESSION_SECRET | Signs staff sessions and manage-links |
| MESSAGE_PROVIDER, MESSAGE_PROVIDER_KEY, MESSAGE_SENDER_ID | Verification and reminder messages |
| GROW_USER_ID, GROW_PAGE_CODE, GROW_API_KEY | Payments, version 1.1 |
| WEBHOOK_SECRET_PAYMENT, WEBHOOK_SECRET_MESSAGING | Verify provider callbacks |
| STORAGE_BUCKET, STORAGE_ENDPOINT | Gallery and product images |
| PORT, HEALTH_PATH | Also recorded in the server's .env as FF_PORT and FF_HEALTH_PATH |

Provide an env.example in the repository with every name and a one-line explanation.

### Routing and webhooks

- The showcase sits behind a password gate on every path. Payment and messaging callbacks must not be gated, so agree one public path prefix, /api/webhooks/, which the server will route separately with its own stricter rate limit.
- The app must verify each callback's signature and handle repeated deliveries safely.
- At go-live the password gate and the "do not index" header come off.

### Release flow

1. CI builds, tests and pushes the image with the commit tag.
2. CI connects over SSH with a limited key and runs deploy <tag>; the key can only run status, deploy <tag>, rollback, history and logs.
3. The server pulls the image, switches only fluffyfur_web, checks the health path and rolls back automatically if it fails.
4. Database migrations run before the switch and must keep the previous version working.

### Database access (to settle with the server side before the data layer is final)

From its network the app can reach Supabase's gateway but not Postgres directly. Two ways forward: (a) the server attaches the app to a network that reaches the Supabase pooler, and the app uses its restricted role over a normal Postgres connection; (b) the server exposes fluffyfur through Supabase's REST service and the app calls it with a limited key. Build behind a repository layer so either works. Recommendation: (a), because the booking logic needs transactions and the overlap constraint.

## Integrations

Providers are not chosen yet. Build each integration behind a small interface with a fake implementation for tests and local work, so the provider can be picked late.

| Integration | What the app does | Provider | Decide by |
| :---------- | :---------------- | :------- | :-------- |
| Phone verification | Send a one-time code, check it, limit attempts per phone and per address | Open: SMS or WhatsApp | Before phase 3 |
| Confirmation and reminders | Send from the outbox: confirmation at booking, reminder before the visit, notice on cancel or move | Open: WhatsApp Business or SMS | Before phase 3 |
| Payment | Create a payment on Grow's hosted page, receive its callback, confirm the transaction, mark the booking paid | Grow (Meshulam), account needed | Version 1.1 |
| Email (staff notices, optional) | Send through an external mail service | Open | Optional |
| Maps and social | Plain links: Waze, WhatsApp chat, Instagram, Facebook, TikTok, phone call | None | Targets from the owner |
| Campaign tracking | Read utm_* and fbclid on first visit and store them on the booking | None | Version 1 |
| Object storage | Gallery and product images | Supabase Storage or a server volume | Before phase 2 |

Rules

- The server cannot send mail on port 25; use a mail or messaging service over HTTPS.
- Message prices and WhatsApp template rules change; keep message text in templates, not code, and write them in Hebrew.
- Payment keys stay on the server. The browser only receives a redirect to the hosted payment page.
- Every callback is checked for a valid signature, handled once, and logged without personal data.

## Quality requirements

These are pass or fail for every release.

| Area | Requirement |
| :--- | :---------- |
| Hebrew and right-to-left | Pages set lang="he" and dir="rtl"; layout uses logical properties; phone numbers, prices and English product names display correctly inside Hebrew text; a Hebrew font with full coverage is loaded |
| Accessibility | Meets Israeli standard IS 5568 (WCAG 2.0 AA at minimum; aim for 2.2 AA): semantic HTML, visible focus, keyboard-only booking, contrast, Hebrew alt text for images, labelled form fields and error messages, an accessibility statement page. Do not rely on an overlay widget |
| Time | Store UTC, show Asia/Jerusalem. Tests must cover the autumn clock change (25 October 2026) and the spring change: a slot at 09:00 stays 09:00 local on both sides |
| Mobile and speed | Mobile first, because visitors arrive from an Instagram link. Resize and compress images, load the gallery lazily, and keep the booking steps usable on a slow connection |
| Security | Validate every input; set a strict content security policy; secure, same-site cookies; protection against cross-site request forgery on forms; no personal data in logs; secrets only in environment variables; dependencies pinned and scanned in CI |
| Abuse control | Limit one-time-code requests and booking attempts per phone and per address; add a hidden field and a delay check against bots; never reveal whether a phone number already exists |
| Privacy | Collect only name and phone (and pet details if needed). Ask consent for messages and record it. Provide a way to erase a customer. Follow Israel's Privacy Protection Law, Amendment 13 |
| Reliability | The booking write is one transaction. Repeated clicks, repeated callbacks and a retried worker must never create a double booking or a double message |
| Search | Title, description, LocalBusiness structured data, and a sitemap, switched on only at go-live; the showcase stays "do not index" |
| Observability | A health endpoint, structured logs, and an error report path that does not include personal data |

## Repository, environments and pipeline

### Repository layout (proposed)

- app/ the web application (pages, API routes, admin)
- worker/ the reminder and cleanup worker
- db/migrations/ and db/seed/ plain SQL and the seed script from section 3
- docker/ the production image definition and a local development compose file
- tests/ unit tests and end-to-end booking tests in Hebrew
- .github/workflows/ the build, test and push pipeline
- env.example, README.md, and CLAUDE.md with the rules in section 12

### Environments

| Environment | Where | Data | Access |
| :---------- | :---- | :--- | :----- |
| Local | Developer machine, Docker compose with its own Postgres and fake providers | Seed data only | Open |
| CI | GitHub Actions | Throwaway database per run | Open to the repository |
| Showcase | flfy.gtechvps.dev, behind a password gate | Seed data, test bookings | The client, by password |
| Production | Same server, the client's own domain, no gate | Real customers | Public |

There is no separate staging site by decision; the showcase is the only shared test place, so treat every release to it as a real release: tested, migrated safely, and reversible.

### Pipeline

1. Pull request: lint, type check, unit tests, migration check on a throwaway database, end-to-end booking test, dependency scan.
2. Merge to main: build the image, tag it with the commit, push it to the registry.
3. Manual approval, then run deploy <tag> over the limited SSH key. Check status and the public page; roll back on any doubt.
4. Migrations are additive first (add column, backfill, then switch code, then remove later) so that a rollback never meets a schema it cannot read.

### Working rules

- Local development uses a local database; the build session never receives production keys, the Supabase service key or root access.
- Every change to the fluffyfur schema is a migration file reviewed in a pull request.

## Build phases

Gates are checks, not dates, and the phases are not drawn to scale. A phase is done when its gate passes, its tests pass in CI, and the build session has written a short note of what was built and what was skipped.

Definition of done for version 1: every row marked version 1 in section 2 works on the showcase; the container contract in section 7 is met; a release and a rollback have both been rehearsed; the open decisions in section 13 that block go-live are closed.

## Starting a Claude Code session

### Set up before the first prompt

1. Create the repository on GitHub and clone it on your Mac, where Claude Code has network access.
2. Install Docker locally so Claude Code can run the app, a local Postgres and the end-to-end tests.
3. Give Claude Code the GitHub command-line tool (or a GitHub connector) for pull requests and CI results.
4. Install Playwright for browser tests, with Hebrew locale and right-to-left checks.
5. Add this document, or its exported Markdown, to the repository as docs/build-brief.md, and write CLAUDE.md from the rules below.
6. Do not connect the session to the production server or Supabase. Releases go through CI and ffctl.

### Rules for CLAUDE.md

- Hebrew, right-to-left, mobile first. Check every page at phone width.
- Follow section 7 exactly: one stateless container, health path, environment variables, JSON logs, immutable tags.
- Never write secrets, real phone numbers or customer data into code, tests, logs or commits.
- Every provider sits behind an interface with a fake for tests.
- All times in UTC in storage; test the clock change.
- Migrations are additive and reversible; no change to a shared Supabase setting.
- Ask before choosing a provider, adding a paid service, or changing a decision in section 13.
- Finish each phase with tests passing and a short note of what was built and what was skipped.

### First prompt (paste into the new session)

```text
Read docs/build-brief.md fully. We are building the Fluffy Fur booking web app.
Start with phase 1 only. Before writing code, reply with:
1. The stack you will use, confirming or changing section 5, with reasons.
2. The repository layout and the first ten tasks in order.
3. Any question from section 13 that blocks phase 1.
Then wait for my approval. Do not contact any server or create any paid account.
```

## Open decisions and risks

### Decisions

| # | Decision | Recommendation | Needed by |
| :- | :------- | :------------- | :-------- |
| 1 | Confirm the tech stack in section 5 | Accept the defaults | Phase 1 |
| 2 | How the app reaches the database: Postgres connection or REST | Postgres connection with a restricted role (section 7) | Phase 2 |
| 3 | Customer model: guest booking with a verified phone, or customer accounts | Guest booking; staff-only logins | Phase 1 |
| 4 | How many appointments can run at once (one groomer or several) | Start with one; make it a setting | Phase 2 |
| 5 | Phone verification and message channel: SMS or WhatsApp | Choose one provider and keep the interface | Phase 3 |
| 6 | Payment: required at booking, optional, or at the salon | At the salon for version 1; Grow in 1.1 | Phase 3 |
| 7 | Image storage: Supabase Storage or a server volume | Supabase Storage, to keep the container stateless | Phase 2 |
| 8 | Reminders: own worker container or n8n | Own worker | Phase 3 |
| 9 | The client's own domain | Decide before go-live | Phase 5 |
| 10 | Real Wednesday hours, gallery files, link targets | Ask the owner now | Phase 2 |
| 11 | What the existing fluffyfur.orders table is | Ask whoever created it; replace if unused | Phase 2 |
| 12 | Language switch: Hebrew only, or add Arabic and English | Hebrew only at launch, text kept in translation files | Phase 1 |

### Risks

| Risk | Effect | Handling |
| :--- | :----- | :------- |
| Double booking | Two customers at the same time | Database exclusion constraint, one transaction, tests with parallel requests |
| Message cost and template rules change | Reminders stop or cost more | Interface, templates in data, a fallback channel |
| One-time-code abuse | Cost and spam | Per-phone and per-address limits, delays |
| Clock change | Wrong slot times | UTC storage, tests on both changes |
| Showcase becomes production without a cleanup | Password gate or test data stays | Go-live checklist in phase 5 |
| Shared server affects the app | Slow or down during a neighbour's problem | Server-side limits and monitoring; the app stays small and stateless |
| Missing owner content | Launch slips | Request photos, texts and links in phase 1 |
