# Build notes

## Stage 1: Foundation (2026-10-26)

**Built**

- Project setup: pnpm, TypeScript (strict), Next.js 16 standalone, Tailwind 4, ESLint 9, Prettier, Vitest, Playwright (files 1–6).
- `env.example` with every variable, plus `PROVIDERS` (fake or real), `SITE_NOINDEX` and `WHATSAPP_VERIFY_TOKEN` (file 7).
- Server modules: `config` (checked environment, real providers require their keys), `log` (JSON, personal fields redacted), `db` (pool in the `fluffyfur` schema, transactions), `time` (Asia/Jerusalem, day-first dates) (files 8–11).
- Hebrew strings and `t()` / `isolate()` for mixed-direction text (file 12).
- Root layout with `lang="he" dir="rtl"`, self-hosted Heebo font, skip link and footer links; a placeholder home page (file 13).
- `/healthz`: 200 when Postgres answers, 503 otherwise (file 14).
- Docker image: one image, web by default, worker by `node worker/main.js`; non-root, health check, no secrets (file 15).
- Local services: Postgres 16 with the restricted `fluffyfur_app` role and extensions, and MinIO (file 16).
- CI: lint, typecheck, tests against a Postgres service, build, dependency scan; on `main`, push the image to GHCR tagged with the commit SHA (file 17).
- Object storage interface with S3 adapter and in-memory fake (file 83); signed values, CSRF check, bot check and content security policy (file 84); accessible UI pieces: button, field, radio group, live message, dialog, skip link (file 85); test setup with a throwaway schema per test (file 90).
- Worker entry stub that starts, logs and stops cleanly on SIGTERM, so the image contract holds before stage 5.

**Verified**

- `pnpm typecheck` and `pnpm lint` pass.
- `pnpm test`: 18 tests pass, including both 2026 clock changes and the database test against the compose Postgres.
- `pnpm test:e2e`: the Hebrew right-to-left and skip-link check and the health check pass on a phone viewport.
- The Docker image builds with the default (Turbopack) build. Run as a container:
  - `/healthz` answers 200 at once, and 503 with the database stopped;
  - it runs as the `node` user;
  - the security headers and `noindex` are set;
  - memory use is about 52 MB for web and 19 MB for the worker;
  - `docker stop` ends both within 1 second with exit code 0.

**Changed while verifying**

- MinIO was removed from the local compose file: its image is no longer published on Docker Hub, and local work uses the fake storage.
- Tests create throwaway schemas through `TEST_ADMIN_DATABASE_URL` (the Postgres superuser). The app's restricted role cannot create schemas, which matches production.
- Next.js's standalone server exited with 143 on SIGTERM. The app now handles the signal itself (`src/instrumentation-node.ts`, with `NEXT_MANUAL_SIG_HANDLE=true` in the image).
- The end-to-end tests use port 3200 and start their own server, because another container on this machine already uses port 3000.

**Skipped or not yet verified**

- The end-to-end tests do not run in CI yet. They are added to the pipeline in stage 4, with the booking flow.
- Tailwind 4 keeps its settings in `globals.css` (`@theme`), so there is no `tailwind.config.ts` as listed in file 5.
- The design names Node 22 LTS; the image uses Node 22, the local machine has Node 24.
- The content security policy still allows inline scripts, which Next.js needs without per-request nonces. Tightening it with nonces is left for stage 3, when the public pages exist.
- The `site.noindex` admin setting arrives with the settings table in stage 2; until then the `SITE_NOINDEX` variable controls the header.

## Stage 2: Data and engine (files 18–36)

**Built**

- Migrations `0001`–`0005`: every table in the data model, row-level security on all of them, and the no-overlap rule on `appointments` (`exclude using gist (groomer with =, during with &&) where status in ('held','confirmed')`) (files 18–22).
- `scripts/migrate.ts`: applies pending files in name order, one transaction each; `--check` lists pending files and exits 1 if any (file 23).
- `db/seed/seed.ts` and `data.he.json`: six services (sedation shave not bookable online), eight products, opening hours (Wednesday and Friday closed), default service rules, default settings, Hebrew message templates and the business profile. Existing rows are skipped (file 24).
- Repositories: settings (Zod-checked, with defaults, `site.noindex` included), catalog, customers (merge, export, erase), appointments, outbox, owner events, plus small `audit.ts` and `rateLimits.ts` helpers (files 25–30).
- Booking logic: `serviceRules.ts` (age before weight), `slots.ts` (pure free-time functions), `service.ts` (`getWeek`, `requestHold`, `confirmBooking`, `moveBooking`, `cancelBooking`, `ownerCreateBooking`) (files 31–33).
- The image now carries `worker/migrate.js` and `worker/seed.js` for the release step; CI migrates and seeds twice as the app role and then runs `migrate --check`.

**Verified**

- `pnpm typecheck` and `pnpm lint` pass. `pnpm test`: 51 tests pass.
- Twenty parallel holds on one slot give exactly one hold (run five times in a row, no flakes).
- Expired holds are released and the slot is free again; a move happens in one step; an owner booking over a held slot is refused; the same one-time key returns the same booking, also when sent twice at once; a cancel inside the cutoff is refused.
- Free times keep 09:00 local and an even 15-minute step on both 2026 clock changes.
- Migrate and seed run as `fluffyfur_app` against the local `fluffyfur` schema, and again from inside the built image. The app's tables are owned by `fluffyfur_app`. The web container still answers 200 on `/healthz`.

**Decided while building (differs from the design's file list)**

- Extensions are not created by `0001`: the restricted app role cannot create them. The migration checks they exist and stops with a clear message; the database administrator creates them (as `docker/dev-init` does).
- Row-level security is on with no policies. The app role owns the tables, so it is not blocked; every other role, including Supabase's public roles, sees nothing.
- `schema_migrations` is created by the migration runner, not by `0001`.
- `push_subscriptions` is in `0005`, because it references `staff`.
- The outbox uses one `dedupe_key` (for example `reminder:<id>:<start>`) instead of a unique key on appointment, kind, channel and send time, because the channel is chosen by `route()` at send time, not when the row is queued.
- `service_rules` also keys on the request (groom or nails), so "nails only" is a rule like the others.
- A booking's stored end includes the buffer after the visit, so the database rule enforces the buffer too. The visit itself (without the buffer) must end by closing time.
- Pets are saved on the customer only when the booking is confirmed; until then they sit on the hold. An unverified form cannot add pets to someone else's record.
- Outbox rows carry no private link. The worker will issue a fresh link when it sends (stage 5), so a usable token is never stored.
- Owner bookings skip the notice and horizon rules but not the no-overlap rule, and their owner event is silent.
- Rate limits for holds: 5 per phone per hour, 10 per phone per day, 20 per address per hour.

**Skipped or not yet verified**

- AI photo jobs are queued in stage 7; `confirmBooking` queues only the summary job, and only when `ai.summary` is on.
- `cap.messagesMonthly` defaults to 1,000 and `cap.aiMonthlyAgorot` to 15,000 (about 40 USD); both are placeholders until the owner and the provider prices are known.

## Stage 3: Public site (files 37–47, 89)

**Built**

- Public pages in the `(site)` route group: home, services, products, gallery, hours, contact, accessibility statement, privacy notice, and a `/book` placeholder until stage 4 (files 37–42).
- Campaign landing pages at `/l/<slug>`, written as code in `src/landing/`, with shared sections (hero, service highlight, gallery strip, call to book, FAQ). One example: `/l/dog-grooming` (file 43).
- Site components: header, footer, contact buttons (shown only when the owner filled in the detail), service and product cards, gallery grid, hours table, and `Price`, `Duration`, `Phone`, `Time` wrapped in `<bdi>` (file 44).
- `sitemap.xml` and `robots.txt`; robots closes the site while `site.noindex` or `SITE_NOINDEX` is on, and each page also gets a robots meta tag (file 45).
- `seo.ts`: LocalBusiness JSON-LD and page titles from the business profile; missing details are left out (file 46).
- `src/proxy.ts` (Next.js 16 renamed middleware to proxy): a fresh script nonce and strict content security policy per page, the campaign-tag cookie (signed), and the CSRF cookie. `tracking.ts` counts clicks per Israel day (file 47).
- Counted redirects, so clicks are measured without page scripts: `/go/book` → `/book`, `/go/order/<id>` → the wa.me chat with the product and price in Hebrew.

**Verified**

- `pnpm typecheck` and `pnpm lint` pass. `pnpm test`: 62 tests pass.
- `pnpm test:e2e`: 20 tests pass, against a production build on a phone viewport: axe (WCAG 2.1 AA) on all ten pages, content without JavaScript, noindex (header, meta and robots.txt), a different nonce per request, the WhatsApp link (number and encoded Hebrew text), the "Book" redirect, the JSON-LD, the campaign cookie, and a 404 for unknown landing pages.
- Screenshots at phone width checked by eye: right-to-left order, prices and durations display correctly.

**Decided while building**

- The content security policy no longer allows inline scripts: only scripts with the request's nonce run (`'strict-dynamic'`). Inline style attributes are still allowed, because they cannot carry a nonce.
- Public pages render on each request (they read the owner's content, and nonces need it).
- The accessibility statement and privacy notice are written in the page files, not `he.json`, and are drafts for legal review (Q7). The accessibility contact uses the salon phone until a named contact is given.
- Images use plain `<img loading="lazy">`; resizing happens on upload (stage 6), not through Next.js image optimisation.
- The e2e tests run against `next build && next start`: the dev server reloaded pages mid-test.

**Skipped or not yet verified**

- The end-to-end tests still do not run in CI; they join in stage 4.
- The business profile is empty until the owner sends address, phone, social links, logo, cover and photos, so those parts of the pages stay hidden for now.

## Between stages 3 and 4: services that are not set up are off, not faked

- With `PROVIDERS=real`, each outside service (storage, WhatsApp, email, push, AI) is on when all its keys are set and off when none are. A partly filled service stops start-up with the missing key names (`src/server/config.ts`, `providerMode()`).
- `src/server/features.ts` turns that into features: online booking needs WhatsApp or email to send the code; otherwise the booking page asks customers to call. Photo uploads need storage.
- Verified: the image runs with `PROVIDERS=real` and no service keys; `/healthz`, the home, services, products and booking pages answer 200, and the booking page shows "booking by phone only".
- Reason: the owner wants no fake services on the live site; a missing service hides its feature instead.

## Redesign and installable app

- New look, mobile first: sticky header with links on wide screens, an app-style bottom bar on phones (book in the centre), cards with icon badges, a hero with paw pattern, and a brand call-to-action band. Icons are inline SVG (`src/components/ui/Icon.tsx`); no icon font or outside origin.
- Installable app (PWA): `src/app/manifest.ts` (RTL, Hebrew, standalone, shortcuts), PNG icons drawn at `/app-icon/<variant>`, `public/sw.js` (pages from the network with an `/offline` fallback, static files cache-first), and `InstallPrompt` (install button where the browser offers it, an "Add to Home Screen" hint on iPhone). No orientation lock, so the installed app works on desktops too.
- The Docker image now copies `public/`.
- Tests: e2e checks the manifest, every icon, the service worker registration and the phone/desktop navigation; axe passes on every page.

## Stage 4: booking and identity

- Booking flow at `/book`: pets → time → contact → code, then the private link `/b/<token>` is the confirmation page. Each step is a server-rendered page with plain forms that post to `/api/booking/{draft,hold,verify,resend,manage}` and get a 303 back, so it works without JavaScript. Progress lives in a signed cookie (`ff_book`); the step is in the address, so back and reload work. JavaScript only loads days in place, moves between days with the arrow keys, and runs the 30-second "send by email" timer.
- Identity (`src/server/identity/`): 6-digit codes with 10-minute expiry, 5 attempts (counted in the database before comparing), 3 sends per phone and 10 per address an hour. Codes, link tokens and device tokens are stored only as HMAC hashes keyed with `SESSION_SECRET`. Trusted-device cookie `ff_device` for 90 days skips the code for the same customer. Cancelling revokes the private link.
- The notify core arrived early because codes are sent while the customer waits: `route()` (the routing table, outage switch, monthly cap, opt-out), `deliver()` (one outbox row → channels in order, back-off on passing faults), real WhatsApp (Cloud API templates) and email (HTTPS JSON API at `EMAIL_API_URL`) adapters, and fakes that write to the new `fake_messages` table (migration 0006). Codes still go through an outbox row; the code itself is never stored there.
- Confirming records consent to appointment messages; the private link can turn messages off and on again.
- Not yet: pet photos in the first step arrive with the AI stage (they need storage and the photo checks); the worker that sends the queued confirmation and reminder is stage 5.
- Tests: `routing.test.ts`, `identity.db.test.ts` (codes, tokens, trusted device, consent, cutoff) and `tests/e2e/booking.spec.ts` (two dogs by keyboard with axe on every step, move and cancel, after-cutoff call only, email fallback, a two-browser race, phone fallback at the cap). CI now runs the e2e suite.

## Stage 5: messages and owner alerts

- Worker (`worker/main.ts`): every 5 seconds claims due outbox rows (`for update skip locked`) and hands each to `dispatch()`; every minute releases expired holds, checks the message cap (owner told once a month at 80% and 100%), and runs the daily jobs: clean-up 03:00, owner check push 08:00, receipts check 14:00. Daily jobs claim a row in `job_runs` (migration 0007), so restarts and extra workers never repeat them. SIGTERM waits for the task in flight.
- `dispatch()` gives each booking message a fresh private link at send time (the outbox never stores one), skips reminders whose booking moved or was cancelled, and sends owner alerts to every owner device; a 404/410 removes the subscription. Push payloads hold only type, time and path.
- WhatsApp webhook `/api/webhooks/whatsapp`: GET verify challenge, POST checks `X-Hub-Signature-256`. Statuses only move forward; `failed` puts the row back once so `route()` picks email. Incoming messages are stored once, raise an owner event, opt-out words (הסר, עצור, הפסק, stop) withdraw consent, and one fixed reply goes out per sender per day (`auto_reply`, plain text inside the open chat). With fake providers the webhook signs with `SESSION_SECRET` for tests; with WhatsApp off it answers 404.
- `/api/push/receipt` records that an owner device received a push. Subscribing a device needs the admin login, so it comes in stage 6.
- Real adapters: WhatsApp Cloud API (`graph.facebook.com/v21.0`), email over any HTTPS JSON API (`EMAIL_API_URL`, bearer key; Resend's shape), push with `web-push` (VAPID, TTL 1 hour, urgency high). For launch, the WhatsApp templates in `data.he.json` must be approved in Meta under the same names, Hebrew, with a URL button `https://<domain>/b/{{1}}` on booking messages and a copy-code button on `ff_code`.
- Tests: `outbox.db.test.ts` (no double sends, fresh links, failed → email once, repeat callbacks, cancelled reminder, failed list, replies and opt-out, owner pushes and the receipts email, daily-job claims). One unit run failed once and then passed eight times in a row; the failure could not be reproduced.

## Stage 6: admin

- Login at `/admin/login`: email and password (Argon2id; 10 failures in 15 minutes lock the email, 30 attempts per address), then a 6-digit app code (each time step accepted once, migration 0008), then a 30-day session cookie that renews on use. Accounts are made with `pnpm staff:create <email>`, which prints the authenticator key.
- The admin area is its own installable app (`/admin/manifest.webmanifest`, scope `/admin/`, `public/admin-sw.js` for pushes). Pages: Today (next bookings, new events, failed messages, alert devices with enable, test and remove), Calendar, Messages, Customers, Content, Hours, Settings. Phone first: a scrolling tab bar on top; a side menu on wide screens.
- Calendar: FullCalendar day and week views, Hebrew, right to left, weeks from Sunday. Drag moves a booking through the same move rule as customers (a refusal snaps it back), pulling the edge lengthens it, a tap on an empty time opens the owner booking form, a tap on a booking opens completed, no-show, +15 minutes and cancel with notice. Customers get `owner_change` messages; owner events from the owner's own actions are silent. Every change is in the audit log.
- Hours: weekly hours as quarter-hour lists (24-hour times on every phone) and time off. A time off over booked visits lists them with "cancel and notify".
- Content: services and prices, the pet-to-service rules, products, gallery (upload only when storage is set up; a photo shows publicly only with the consent tick), salon profile, message wording. WhatsApp wording is read-only because Meta approves it; email and push wording can change but must keep the same `{placeholders}`.
- Customers: search by name or phone, record with pets, bookings, consents, internal notes, merge, JSON export and erase (personal data removed, booking history kept).
- Settings: booking rules, switches (AI switches only when an AI key exists), the two WhatsApp numbers and the monthly caps. Only changed values are written and audited.
- Tests: `staff.db.test.ts` (password, lockout, code reuse, sessions, owner move/extend/cancel with notices and audit) and `tests/e2e/admin.spec.ts` (pages need login, wrong code refused, login with a real app code, every page on a phone with no sideways scroll and axe on Today, the calendar in RTL, a settings round trip).

## Stage 7: AI

- Provider interface `src/server/ai/types.ts`, fake (`ok`, `fail`, `slow`, `invalid` modes) and an Anthropic adapter on the official SDK (`@anthropic-ai/sdk`). **No model is chosen in code**: AI is on only when `AI_API_KEY`, `AI_MODEL` and the two `AI_PRICE_*_AGOROT_PER_MTOK` prices are all set, so the model is confirmed with the owner before the first paid call. 20-second timeout, no SDK retries (the job tries twice), refusals and cut-off answers count as failures, and the cost comes from the token counts the API returns.
- Prompts are versioned constants (`photo-v1`, `summary-v1`) in `src/server/ai/prompts.ts`. Photo output is checked with Zod: species, breed, coat and a condition from a fixed list; nothing about skin, injuries or health.
- Jobs (`src/server/ai/jobs.ts`, run by the worker every minute, at most 5 at a time): switch off → skipped; the most a call can cost is reserved in `ai_spend` first and the job is skipped past the monthly cap (the owner is told once a month); the reservation is then settled to the real cost. Failures are silent: two tries, then `failed`.
- Pre-visit summaries are queued at 19:00 for tomorrow's confirmed bookings, and shown on the Today page and in the calendar's booking panel. The earlier queueing at confirm time was removed so the note uses the latest facts.
- Pet photos (migration 0009, `src/server/photos.ts`, `/api/booking/photo`): on the private link, one optional photo per pet when storage and photo analysis are both on. `sharp` re-encodes to WebP, at most 1280 px wide, without metadata; the file is private; a `photo_analysis` consent is recorded; the AI job is queued. The suggestion appears on the private link to accept or correct ("the final price is set at the salon"); accepted values go on the pet. Photos are deleted 90 days after the visit by the nightly clean-up.
- Difference from the design: the photo is added on the private link right after booking, not inside the first booking step. Booking stays four plain steps that never wait on uploads, and the pet record exists by then. Moving it into step 1 later is possible.
- HEIC: accepted, but `sharp`'s standard build cannot decode HEVC images; such a file gets "try another photo". iPhone browsers usually convert to JPEG when uploading.
- Tests: `ai.db.test.ts` (switch off, summary with cost, cap and one owner alert, failing and slow provider leave the booking and messages alone, invalid output, 19:00 queueing, photo re-encode without EXIF, suggestion, accept, expiry) and a private-link photo e2e test.

## Stage 8: import and launch

- Migration 0010: `import_runs` plus staging tables for Dibs customers and appointments. `src/server/import/dibs.ts` reads the CSV (BOM, quotes, Hebrew headers) with the column names, date format and service map from `db/seed/dibs-service-map.json`, because the real Dibs export format is not known yet (Q6). Pass a corrected copy with `--map=<file>`.
- Staging checks every row and lists problems by row number: missing or repeated reference, bad phone, bad time, unknown service, and clashes with existing bookings. Customers are merged by phone. `--dry-run` stops there and prints the report; nothing personal is printed.
- The real run (`--freeze-time`) creates future bookings through the same booking rule as everyone else (the database still refuses overlaps; refusals are counted), marked as imported with the Dibs reference, and no messages or owner alerts. Past visits are stored as completed history. Running it again skips references already imported. The report compares future bookings in Dibs with those now in the new system.
- `--queue-links` puts one `ff_import_link` message per imported future booking in the outbox, 30 every 10 minutes, each once. `--export-future` writes every future booking to a CSV that opens in Excel, as the way back.
- The image now carries `worker/import-dibs.js` and `worker/staff-create.js`. `README.md` covers local setup, commands and adding a landing page; `docs/launch-checklist.md` lists the switch-day gates.
- Tests: `import.db.test.ts` (parsing, problem report, dry run with every problem kind including a clash, writes nothing; real run with merge by phone and no messages; repeat run; link queueing in batches; export).

## After stage 8: CI and image fixes

- `worker/staff-create.js` crashed in the image (`__dirname is not defined`): tsup's `noExternal: [/.*/]` won over `external`, so `argon2` (and `sharp`) were bundled. The pattern now leaves the native modules out; they load from `node_modules` at run time.
- CI starts the bundled scripts after the build, and the image job loads the image, runs every script in it, and pushes only if none fails to load.
- The worker exits with code 1 on bad configuration instead of logging the error every few seconds.
- Tests that depended on the weekday or the time of day were fixed (shared `openDay()` that skips Sunday; the move test avoids the booking's own time; the cutoff is off while testing changes). `claimDue()` counts a row queued in the same millisecond as due.
- Twenty customers racing for one time could deadlock inside the exclusion-constraint check (one got a server error instead of "taken"). Inserts and moves now take one transaction lock (`pg_advisory_xact_lock`) first; the constraint still guards every write.

## English version and the new look

- **Languages.** Hebrew stays at the plain addresses; English lives under `/en` (`/en/book`, `/en/b/<token>`, ...). `src/proxy.ts` rewrites `/en/...` to the same page and sets the `x-ff-locale` header. Pages read it through `getI18n()` (server) or `useI18n()` (client). The `ff_locale` cookie remembers the choice, but only on real page visits. The service worker's offline copy and link prefetches do not change it, and on `/api`, `/go`, `/lang` and `/admin` the header is removed. Form posts and the owner area follow the cookie. The switch is a plain link to `/lang/<he|en>?back=<path>`.
- **Strings.** `src/i18n/he.json` and `en.json` carry the same keys; a unit test checks the keys, the placeholders, and that no Hebrew is left in the English file. `translator(locale)` replaces the old global `t`.
- **Owner content.** Migration 0011 adds optional English fields: tagline, service name and contents, product name and description, gallery alt and caption, and message templates (`body_en`, `subject_en`). `pick()` shows the Hebrew text when the English field is empty. The seed fills English from `db/seed/data.en.json` without overwriting what the owner wrote. The admin forms have the English inputs.
- **Messages.** `customers.locale` is saved once the phone is verified. Customer messages, dates and private links (`/en/b/...`) follow it. A message goes out in English only when that template has `body_en`. The WhatsApp language code follows the message, so English WhatsApp needs the same templates approved in English in Meta. Owner alerts stay Hebrew.
- **Owner area.** All screens, the calendar (en-GB, left to right) and the login page follow the cookie, with a language switch in the menu.
- **Design** (`docs/designs/templates/temp1`, merged into the existing site): violet `#5B3FE0` on white with lilac bands, Rubik. The home page is rebuilt from the mobile and desktop layouts. It has a hero with an open-today badge and a "first available" button, contact shortcuts, services with pet tags, "How booking works" next to a preview of the week's free times (for a small adult dog), before & after photos, hours and how to find us, a product row, and an "Already booked?" card. The header has a phone menu; the footer has three columns. The bottom bar, install prompt, booking flow and accessibility work stay.
- **SEO.** `pageMetadata()` gives hreflang alternates and `og:locale` per language, and the sitemap lists both languages. The campaign pages carry `meta` per language.
- **Fixes on the way.** The outbox now takes "due" from the database clock when no time is given, so a host clock behind Docker's no longer holds messages back. `Alert` moved to `src/components/ui/Alert.tsx`, so the client calendar no longer imports server code.
- **Not translated:** the installed-app manifest (one per site; it stays Hebrew), the offline page copy the service worker caches (Hebrew), and the owner's free-text answers.
- **Tests:** `t.test.ts` (dictionaries, addresses, `pick`, English formats), axe on every public page in English too, a language switch e2e, and a full English booking that checks the English code message and the saved customer language.

## Stats screen, email-only booking, setup guide

- **Stats** (`/admin/stats`, `src/server/admin/stats.ts`): the after-launch measures from goal G10, for 7, 30 or 90 whole Israel days. Bookings made (online, owner, import) and cancelled, visits and no-shows, "Book" and "Order on WhatsApp" clicks with the share of book clicks that became online bookings, messages by channel with cost and failures, AI spend this month, bookings per week for 12 weeks (bars with a table view), online bookings by `utm_source`, and pets per service. Held and released slots never count. Week buckets are made in code from Israel dates, through `time.ts`. No outside analytics and no new tracking.
- **Email-only booking**: when WhatsApp is not set up, the email field is required, says the code goes there, and the hold route refuses a form without it. Checked end to end against a local stand-in for the email API.
- **Redirects**: `/go/*` now builds on `APP_BASE_URL`; behind the proxy `request.nextUrl` carried `0.0.0.0:3000`. The e2e server listens on `0.0.0.0` like the image, so the test sees that host.
- **Guide**: `docs/guide.md` covers server setup, email (Resend's request format), WhatsApp templates in Hebrew and English, updating with `ffctl`, and daily use of every owner screen.
- Tests: `stats.db.test.ts` (period bounds, week buckets, every figure inside and outside the period), the stats screen in both languages with axe, and the `/go` host test.

## Fixes from the first live email test

- **Email held by another record**: the contacts table allows one owner per email, and the hold used `on conflict do nothing`, so a booking that typed an email kept on an older record got no email and its code went nowhere. Now the code always goes to the email typed for this booking (kept in the signed draft for resends). An unverified address moves to the new booking at once; a verified one moves when the new customer proves it with the emailed code (`claimEmail`).
- **Codes with nowhere to go**: `issueCode` asks `route()` first and answers `NoChannel` before the rate limits count, so failed tries no longer lock the customer out.
- **Log**: the hold route logs `booking code not sent` with the hold id and reason (no contact details).
- **Hebrew code on `/en`**: the code follows the page's language, but the English wording comes from the seed. A server that ran migration 0011 without `node worker/seed.js` has no English text and falls back to Hebrew.
- Tests: an email held unverified and verified by another record, and failed sends not counting toward the limit.

## Calmer visual design (owner request)

- The owner found the temp1 look too busy and "full". New tokens in `globals.css`: warm neutral base (`paper` #f6f5f2, `ink` #1c1b19), one deep green accent (`brand` #1f5c55) kept for actions and the current choice, neutral tags instead of peach, lighter headings (600). Every text pair checked for AA; the accent and body text pass AAA.
- Home page cut to: hero with one booking button, contact buttons, up to five services as quiet rows (`ServiceRow`), four short booking steps, gallery, hours with the address, four products, and a light "already booked?" block. Removed: the week preview, the phone section tabs, the floating badge and the dark band. Each removed part still has its own page (services, hours, products, booking).
- Quieter shared parts: outline buttons are neutral, day tiles in the booking calendar use the solid accent only for the chosen day (each day still says its status in words), product cards have no frame, hours highlight today on paper, contact buttons are pills on desktop.

## Admin calendar on FullCalendar 7 (owner request)

- Upgraded FullCalendar 6.1.22 to 7.1.3 (MIT; one `@fullcalendar/react` package plus `temporal-polyfill`). The Forma theme with the site's colours replaces the hand-written v6 overrides. Schedule-X was ruled out because its drag and drop now needs a paid licence.
- The grid shows only the salon's hours (earliest opening to latest closing) and shades closed times from the opening hours. Bookings are soft tinted blocks with an accent edge; done is green with a check mark, no-show grey and struck through; the status is also written out in the panel.
- One toolbar of our own: previous / today / next, the date, Day and Week (`aria-pressed`), and "New appointment". On wide screens a side panel lists the bookings in view, or shows the chosen booking's details and actions, or the new booking form; on phones these open in a bottom sheet (native modal `<dialog>`).
- v7 reloads an event source whose function changes, so the source keeps one identity; it returns nothing during server rendering.
- e2e: the calendar test now checks the title and the Day/Week switch instead of v6 class names.

## One email per phone (owner decision)

- A live test sent a confirmation to an older verified email instead of the one typed (the booking came from a trusted device, so no code ran). The owner chose: the phone is the customer, with one email.
- `setEmail` makes an address the customer's only email and removes others; `getEmail` reads it. At the hold, a typed email replaces one nobody verified. With a verified email on file and another typed, the code goes to the email on file (`codeEmail` in `flow.ts`); the code step shows it masked, offers "send the code to my phone", and a ticked box replaces the email after the code (`keepEmail` in `verifyAndConfirm`). A trusted device replaces it at once.
- Screens name where messages go, masked: the code step ("to k***@proton.me", "the number ending 1234") and the confirmation (`bookingView.messagesTo`, the same `route()` choice the worker makes).
- Existing records with several emails are cleaned on the customer's next booking.
- Tests: unit (replace unverified, code to the email on file then replace, keep the old one with the code on the phone, trusted device, masks) and e2e (the replace box on the code step, the masked addresses).

## Full-width calendar with a month view (owner request)

- The owner found the calendar squeezed between the admin menu and the side panel. On `/admin/calendar` the menu becomes a row above the page (`AdminFrame`; other admin pages keep the column), and the side list of bookings is gone: details and the new booking form open in a drawer on the end side of wide screens and a bottom sheet on phones (one native modal `<dialog>`).
- Month view (`dayGridMonth`) next to Day and Week. Each day shows up to three bookings and "+N", a count of the day's bookings (no-shows not counted) and "closed" on days without opening hours, which are shaded in every view. On phones the month shows the counts only.
- Calendar hooks: `dateClick` opens the form at a free time, or the day itself from the month; `navLinks` make day headings open the day; `dayCellClass` / `dayCellTopContent` mark closed days and counts.
- FullCalendar starts loading events during the first render, so the loader waits for the mount before setting state (it caused a React "state update before mount" warning).
- The library's `skeleton.css` loads after `globals.css` and uses `!important`, so overrides of its display rules are scoped under `.admin-calendar`.
- e2e: the calendar test switches to Month and opens a day from it.

## Home page: first free time as a button, new order, pink (owner request)

- The hero's "first free time" is a button to `/go/book?at=<ISO>`, which saves the start in the draft (`wantedStart`) and opens the booking (the time step if the draft already has pets). The pets step says which time was chosen; the time step opens on its day and offers "the time you chose" when it fits the pets, or says it doesn't and shows the free times. Choosing a time clears it. The time is not held until the contact step, so the wording never says "saved".
- Home order: hero, contact, services, hours and address, products, photos, how booking works, "already booked?".
- Hero follows the temp1 layout: on phones the cover across the top with the logo over its edge and centred text and full-width buttons; on wide screens the words and two buttons beside the cover, which carries the "four steps" card. Without a cover a soft pink panel stands in. Contact buttons are equal tiles on wide screens.
- Accent is now pink (`brand` #c2185b, `brand-strong` #a3134c, `brand-soft` #fdeaf2, `paper` #fcf5f7); every text pair re-checked for AA (white on brand 5.9:1, brand-strong on paper 7.1:1, muted on brand-soft 5.1:1). The browser theme colour and the admin calendar follow.
- e2e: the home button carries its time into the booking and it is offered after the pets.

## Design drift check and fixes before the first client release

- An EGM drift report (`docs/drift/2026-10-28_DRIFT_REPORT.md`) compared `fluffy_fur.md` with the code. The owner chose to fix six items before the client preview; the rest stays open in the report.
- **Moved bookings keep their link**: `appointments.move` now sets the live private links' expiry to the new end in the same transaction (it stayed at the old end before, so the first link died early).
- **Owner bookings and moves respect opening hours and time off** (`ownerTimeCheck`, `fitsDay` in `slots.ts`); the calendar says "outside opening hours" or "blocked as time off". Other bookings are still left to the database rule.
- **A customer who typed no email can still get the code by email**: after 30 seconds the code step asks for an address and sends the code there (the one-email-per-phone rule still picks the address).
- **Landing links for cats** (`/go/book?species=cat`) now open the pet step with cat chosen (later replaced by the service step's cat filter).
- **The owner stays logged in**: the proxy renews the session cookie for 30 days on each admin page (the session itself was already extended in the database). The cookie name and life moved to `src/server/staff/cookie.ts` so the proxy needs no database code.
- **Gallery uploads are cleaned**: re-encoded to WebP at most 1600 px with no metadata (no camera location on the public site), through the same `toWebp` the pet photos use. Limit raised to 8 MB to match pet photos.
- Tests: link expiry after a move, owner refusals, the late email on the code step (e2e), cat links (e2e), cookie renewal (e2e), metadata stripping (unit).

## Client feedback on v0.1.0: choose the service, pet details last

- The client's three requests: show the service chosen on the site in the booking, ask the pet's details at the last step before the code, and add the vaccine certificate and the vet's name. The owner chose: service → time → details → code; vaccines as a required "up to date" box (the certificate is shown at the salon, no file stored); vet or clinic name required.
- Step 1 is now the service for each pet (`ServiceStep`), replacing the species/age/weight questions. Service links on the site go to `/go/book?service=<id>`, which adds that service to the draft so step 1 shows it as chosen. `?species=` still narrows the list for landing pages. The draft keeps `serviceIds` and the typed pet details.
- The details step asks, per pet: name, dog or cat only when the service is for both ("nails only"), breed, vet or clinic, and the vaccines box; then name, phone and email. What was typed survives an error.
- Booking code takes `serviceIds` (`getWeek`, `requestHold`); each pet carries its `serviceId`, species, vet and the confirmation, and the hold refuses a species the service is not for. `service_rules` now give a service's species and the age and weight saved on the pet (`speciesFor`, `profileFor`), and still pick the home page's first-free service.
- Migration `0012_pet_health.sql` (additive): `pets.vet_name`, `pets.vaccines_confirmed_at`. A pet booked again (same name and species) is updated instead of added twice. The owner sees the vet and "vaccinations up to date (customer says)" on the calendar booking and the customer page.
- Tests: species and profile of a service (unit), vet and vaccine saved, wrong species and missing vaccines refused, a repeat pet updated (database), the new steps through every booking e2e, a service link showing as chosen (e2e).

## Client feedback, round 2: one service, straight on; vaccines as yes/no

- The vaccines box is a plain yes/no: "the pet has a vaccination certificate", optional. A "no" books like a "yes"; `pets.vaccines_confirmed_at` is set for yes and cleared for no. The owner sees "has / no vaccination certificate" next to the vet (calendar booking, customer page). No migration.
- Multi-pet booking is hidden, not removed: `MULTI_PET_BOOKING = false` in `src/server/booking/draft.ts`. Choosing a service (on step 1 or from a service link) replaces the draft's service and goes straight to the time step, which now shows the chosen service with a "change" link. The chosen-services card, "bringing another pet?" and "add" are not shown. The multi-pet code paths (draft actions, several pets in `requestHold`, the details step per pet) stay and are still covered by the database tests.
- Tests: a "no" on vaccines is booked and saved as null (database); the e2e flows choose one service and land on the time step; a service link goes straight to the time, the "change" link shows no "another pet" choice, and the vaccines box is not required.

## The v3 look (temp2) and owner login by email code

- The public site follows the "v3" mock-ups in `docs/designs/templates/temp2/` (a phone board and a desktop board): a warm cream page (`canvas`), white cards with large radii, plum ink, one raspberry accent, four pastel tints (pink, yellow, mint, lilac) with their own inks, Fredoka headings, Rubik for Hebrew text and Nunito on English pages (Nunito has no Hebrew letters, so `html[lang=en]` switches the body font). The tokens in `globals.css` changed in place, so every page and the owner area follow; every text pair was re-checked for AA. Browser theme colour and manifest follow.
- Home page rebuilt in that order: the cover in an arch with the "dogs & cats" sticker, a slogan (`home.heroTitle` + accent), the tagline, and a white card with the open status, up to four free times (today's, or the first day that has any, each a link to `/go/book?at=`) and the booking button, with WhatsApp beside it when the chat number is set; a scalloped "cloud" edge (CSS only, `.cloud-edge`) into the pink services band, each service a card with a tinted blob, length and what it includes, the "from" price pill and a "+" that books it; the gallery as a mosaic of up to five shapes; the products as a strip that scrolls on phones (a focusable region) and a four-column grid on desktops; the visit card with the address, the week's hours as soft rows (today in pink; `HoursTable` is shared with `/hours`) and Waze / call / WhatsApp pills; "already booked?" as an accent card. The "how booking works" steps and the separate before/after section were dropped: the mock-up's before/after needs paired photos the gallery does not have yet.
- Header: blob logo and name, the links in a white pill, "My booking" (to contact) on wide screens. Footer: plum under a cloud edge, the name large, the social networks as outlined pills **with their icons** (the one thing the mock-up left out), the info pages, the language switch, then address, phone and year.
- Strings: new `home.heroTitle/heroTitleAccent/sticker/freeToday/freeTomorrow/freeOn/orWhatsApp/servicesIntro/visitTitle`; the dead home keys from the earlier layouts were removed. Fonts come from `@fontsource-variable/fredoka` and `@fontsource-variable/nunito` (self-hosted, nothing loaded from another origin).
- **Owner login by email code**, ported from SAFA CLINIC after its owner found password + authenticator app too many steps. The login page offers "Log in with a code by email" when email is on: email, then the 6-digit code from the inbox; the password and app login stays. Migration `0013_staff_email_code.sql` (additive): `staff.email_code_hash`, `email_code_expires_at`, `email_code_attempts`, and the outbox kind `staff_code`. `sendEmailCode()` / `checkEmailCode()` in `src/server/staff/auth.ts`: 10 minutes, five tries counted in the database before comparing, three sends per address in 15 minutes, the same answer for unknown addresses, only the keyed hash stored. The address rides to the code step in a signed cookie (`ff_admin_mail`). `route("staff_code")` gives email only, outside the monthly cap and the owner's failed-message alerts. Seed: template `staff_code` (email) in Hebrew and English; run `node worker/seed.js` after the deploy. The guide says the owner's email account should have its own two-step check.
- Tests: the home free-time e2e targets the new card's first pill; routing (unit), send/check/limits (database), login by email code (e2e, axe clean); the axe run over every public page passes.

## Gallery and product photos in the owner area

- Gallery: the upload takes several photos at once. The page sends them one
  per request, shows progress, and names any photo that failed. Text is
  optional behind a checkbox and applies to the whole upload; a photo without a
  description gets the general `gallery.defaultAlt`, so it still has alt text.
- The publication tick is gone, by the owner's decision. The `consent` column
  stays (additive first) but is no longer read, so every gallery photo shows.
  New rows store `true`, so a rollback still shows them.
- Products: the form has a photo field to add, replace or remove the photo. A
  replaced file is deleted from storage. No migration: `products.image_key`
  already existed.
- The bag icon looked like a padlock on products without a photo. It is
  redrawn, and those cards now show the paw.

## Closest free time on the home page

The hero card again leads with a button for the closest free time ("התור הפנוי
הקרוב: היום 15:30"), which opens the booking with that time. The pills under it
show the next four times, so no time appears twice.

## Cover photo from the owner area

Salon details now has a cover photo field (add, replace, remove), sharing
`PhotoField` and the save logic with product photos. The file is stored under
`site/`. No migration: `business_profile.cover_key` already existed. The logo
still has no upload.

## Install the app, in every browser

- The home page's hero card has a permanent install button, and the floating
  card now shows in every browser, not only where the browser raises
  `beforeinstallprompt`. Both hide once the site runs as the installed app.
- Chrome, Edge and Android open their own dialog. Safari gives websites no way
  to do that, so iPhone, iPad and Mac Safari get a dialog with the steps.
  `installPlatform` tells them apart; iPad Safari reports itself as a Mac.
- Closing the floating card lasts for the visit (it was forever). It stays off
  the booking pages and private links, where it would cover the buttons.
