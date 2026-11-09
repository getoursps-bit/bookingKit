# Drift report, 2026-10-28

Design checked: `docs/designs/fluffy_fur.md`, at commit `400d2e6` on `build/v1`.
`docs/designs/templates/` holds two zipped page mock-ups only; they are not specs and were not checked.

Each bullet carries a tag (FIXED marks what the first client release fixed; the rest is open):

- **[preview]**: fix before the client preview.
- **[should fix]**: fix before launch.
- **[minor]**: low impact.
- **(build-notes)**: a deliberate change already recorded in `docs/build-notes.md`.

Design line numbers are given as L.

## fluffy_fur.md

### Booking and customer flows

- **[FIXED for v0.1.0] [preview] Moving a booking kills its first link.**
  - L455–457: the private link lasts until the appointment ends, and a move keeps the same link.
  - `appointments.move` (`src/server/repos/appointments.ts:171-188`) never updates `manage_tokens.expires_at`.
  - The link in the confirmation stops working at the old end time.
- **[FIXED for v0.1.0] [preview] Owner bookings ignore time off and opening hours.**
  - L398: the same free-times code serves the owner form. L306: time off blocks booking.
  - `ownerCreateBooking` (`src/server/booking/service.ts:473-521`) and `ownerMove` (`src/server/booking/owner.ts:30-42`) rely only on the database rule against overlaps.
- **[FIXED for v0.1.0] [preview] A customer without WhatsApp who typed no email is stuck.**
  - L208–214 (CUJ 3): "Didn't get a code? Send by email".
  - "Send by email" shows only when an email is on file (`CodeStep.tsx:113`), and the code step has no way to add one.
- **[FIXED for v0.1.0] [preview] The pre-chosen species is ignored.**
  - L1293–1294: landing links carry a pre-chosen species.
  - `/go/book?species=cat` reaches `/book?species=cat`, but `book/page.tsx` never reads it, and `PetStep.tsx:131` always ticks dog.
- **[preview] "Call the salon" disappears without a profile phone.**
  - L90–91, L205–206: every fallback screen offers the call button.
  - The buttons render only when `profile.phoneE164` is set: `b/[token]/page.tsx:72`, `book/page.tsx:58`, `CodeStep.tsx:134`.
  - This is a data check on the live site.
- **[should fix] No note per pet.**
  - L187–189, L1341: each pet can have an optional note.
  - `PetStep.tsx` and the draft have no note field, although `pets.temperament_note` exists.
- **[should fix] Codes don't fall back to email after a WhatsApp failure.**
  - L467–468: the code goes by email when WhatsApp reports failure.
  - `requeueForNextChannel` excludes codes (`outbox.ts:195`), and the dispatcher skips queued codes as stale (`dispatch.ts:43-46`).
- **[should fix] WhatsApp cancellation messages lack the URL button parameter.**
  - A cancelled booking has no token, so `buttonParam` is null (`dispatch.ts:83-84,96`).
  - The approved `ff_customer_change` and `ff_owner_change` templates have a URL button, so Meta will likely reject these messages.
  - Fix before WhatsApp goes live.
- **[should fix] No "Chat with the salon" button in the WhatsApp confirmation.**
  - L193–194, L1458–1459 ask for one.
  - `whatsapp.ts:21-28` sends a single URL button.
- **[should fix] Photos are not resized in the browser before upload.**
  - L420–421 asks for it.
  - `PetPhotos.tsx:77` posts the raw file; only the server resizes it.
- **[minor] The code lifetime is fixed.**
  - `CODE_TTL_MIN = 10` (`codes.ts:13`) does not follow `booking.holdMin` (L411–412).
- **[minor] The one-time key is on the hold form only.**
  - L354–355: every form.
  - Sending verify twice returns `HoldExpired` (`flow.ts:139-140`).
- **[minor] The coat type can't be corrected after photo analysis.**
  - L231–233 asks for it; `PetPhotos.tsx:39-57` shows it read-only.
- **[minor] No `Summary` component; component names differ from L1337–1348.**
- **[minor] The week API reads pets from the draft cookie, and the booking APIs answer with redirects instead of JSON.** (build-notes)
- **[minor] The pet photo moved to the private link, after booking.** (build-notes)

### Admin

- **[FIXED for v0.1.0] [preview] The admin login lasts only 30 days from login.**
  - L1544–1545: a 30-day cookie, renewed on use.
  - `resolveSession` extends the expiry only in the database (`staff/auth.ts:93-112`); the cookie is never set again.
- **[FIXED for v0.1.0] [should fix] Gallery and other uploaded images are stored raw.**
  - L1270: lazy-loaded, resized images.
  - `api/admin/gallery/route.ts:28-34` keeps the original (up to 5 MB) with camera metadata, possibly including location, on a public page.
  - Cover, logo and product images are not resized either.
  - The comments in `GalleryGrid.tsx` and `cards.tsx:159` say they are.
- **[should fix] Products can't get an image.**
  - L1594: product images are planned, but no upload exists (`catalog/route.ts:102`).
- **[should fix] The gallery can't be reordered, and alt text can't be edited after upload** (L1594–1595).
- **[should fix] Pet photos have no signed URLs and share the public bucket.**
  - L1681–1682 asks for signed URLs.
  - `storage.ts:6-13` has no signed-URL method, `publicUrl` uses `/object/public/`, and the owner has no screen to see pet photos.
- **[should fix] Admin and some booking routes check input by hand, not with Zod.**
  - L600, L1625.
  - Admin: `src/app/api/admin/{catalog,bookings,hours,customers,inbox,gallery,push}`.
  - Booking: `verify`, `resend`, `manage`, `week`, `photo`.
- **[should fix] The admin e2e test misses most planned cases** (L1722–1729):
  - an owner phone booking;
  - a refused drag;
  - time off that cancels and notifies;
  - merge and erase;
  - settings that take effect;
  - axe on every admin page.
- **[minor] Time off warns after saving, not before** (L222–223; `api/admin/hours/route.ts:40-51`).
- **[minor] No failure limit on the second-factor code step at admin login** (`auth/route.ts`).
- **[minor] The admin manifest uses the site icons and pre-pink colours.**
  - Hard-coded `#2b2238` and `#fbf6f1` in `admin/manifest.webmanifest/route.ts:18-23`.
- **[minor] Not every admin change is audited.**
  - Push test and device removal, and inbox read marks.
  - Merge and erase are audited outside their transaction.
  - Staff changes and the customer's own move or cancel are not audited (L326).
- **[minor] Replies and failed messages have no read marks of their own** (L565–566).
- **[minor] One route file per area with an `action` switch, not one per action** (L1617).
- **[minor] Push alerts show the time of queueing, not the booking time, and tapping opens the calendar, not the event** (L510–511; `dispatch.ts:147-148`).
- **[minor] The `staff` table has no `role` column** (L322).
- **[minor] The calendar has a month view, a drawer and a full-width layout. There is also a stats page.** (build-notes)

### Messages, limits and AI

- **[minor] The monthly cap also turns WhatsApp off for confirmations and reminders**, not only codes (L503–504; `routing.ts:34-36`).
- **[minor] The cap, AI-budget and warning months use UTC.**
  - `outbox.ts` `monthlyCount`, `worker/jobs/schedule.ts:19-27` and `ai/jobs.ts:39`.
  - CLAUDE.md requires Israel time through `time.ts`.
- **[minor] The sender-number setting is shown but not used.**
  - Sending uses `WHATSAPP_PHONE_NUMBER_ID` from the environment (L498–500).
- **[minor] No per-day limit on code sends, and no per-address daily limit on holds** (L604–605).
- **[minor] The bot check runs on the contact form only** (L606).
- **[minor] The reminder time (24 hours) and the booking limits are constants, not settings** (L935–936).
- **[minor] A failed AI call is recorded without its model or prompt version.**
  - L542–543; `ai/jobs.ts:148-153`.
- **[minor] The summary's "visit history" is only a count of visits** (L538–539).
- **[minor] The AI fake's "invalid" mode throws an error instead of returning invalid data** (L1639).
- **[minor] The AI model and prices are set in environment variables, not settings.** (build-notes)
- **[minor] Summaries are queued only at 19:00, for tomorrow's bookings.** (build-notes)
- **[minor] The `confirmBooking` comment still says it queues AI jobs** (`service.ts:336-338`).
- **[minor] Email uses one generic RTL wrapper rather than designed templates** (L1466–1467).
- **[minor] There is one generic `notify/fake.ts` instead of three fake files.**
- **[minor] `auto_reply` is an extra message kind, and the routing tests miss `auto_reply` and the `owner_check` email row** (L1529–1530).
- **[minor] The alert-failure email only covers subscribed devices** (`ownerAlerts.ts:36`).

### Public site and search

- **[should fix] The landing page FAQ hard-codes the 12-hour cutoff and the visit lengths** (`src/landing/dog-grooming.tsx`).
- **[should fix] The noindex header comes from the build-time `SITE_NOINDEX` variable, not the `site.noindex` setting** (L901; `next.config.ts:7,14`).
- **[minor] JSON-LD has no geo, and there are no coordinate fields** (L1312–1313).
- **[minor] The accessibility statement has no contact when no phone is set.**
  - Its text and the privacy text are hard-coded JSX; both are drafts pending Q7.
- **[minor] The privacy notice doesn't state how long pet photos (90 days) or AI data are kept.**
- **[minor] The booking steps don't link the privacy notice where the details are typed** (G8).
- **[minor] `robots.ts` disallows a missing `/manage/` and doesn't list `/b/`, `/en/book` or `/en/go/`.** Those pages carry noindex anyway.
- **[minor] The hours page shows time off only for the next 30 days.**
- **[minor] English site under `/en`** (L133–134 said Hebrew only). (build-notes)
- **[minor] The home page changed: hero, first-free button and section order.** (build-notes)

### Foundation, data and tests

- **[should fix] The web server checks its environment variables only on the first request, not at start-up** (L942–943; `config.ts:78-87`).
- **[should fix] No coverage threshold** (L1822–1824).
  - Planned: 90% on booking, routing and identity, 70% overall.
  - Nothing is configured, and CI doesn't measure it.
- **[should fix] e2e tests run against the shared dev database with no fixed clock** (L1745–1747).
- **[minor] Font is Rubik, not Heebo or Assistant** (L909).
  - `@fontsource-variable/heebo` is an unused dependency.
- **[minor] Dates are worked out outside `time.ts` in the admin calendar** (client code; `Calendar.tsx`).
- **[minor] ESLint uses the Next.js TypeScript preset, not strict typescript-eslint** (L915).
- **[minor] The `HEALTH_PATH` variable is fixed to `/healthz`** (L990–991).
- **[minor] `env.example` has the real domain filled in** (`env.example:14`).
- **[minor] `compose.dev.yml` has Postgres only, with no web or worker services** (L1007–1008). MinIO's removal is in build-notes.
- **[minor] Not wired into CI:**
  - the 50-request memory script (L1831);
  - the container contract checks (L1828–1830).
- **[minor] The free times for a day take three queries, not one** (L777–778).
- **[minor] Dibs import:**
  - `customers.dibs_ref` is never filled (L307, L589);
  - imports create no owner events (L518–519);
  - customers get one message per booking, not one per customer (L243–244).
- **[minor] There is no place to record the baseline** (Dibs cost, calls and bookings per week; G10).
- **[minor] Merge can leave two emails until the next booking** (L444). Clean-up on the next booking is in build-notes.
- **[minor] The trusted-device cookie is a stored hash of a random token and is not signed** (L451–452).
- **[minor] Recorded in build-notes:**
  - schema details: no `tailwind.config.ts`; FullCalendar as one package; the outbox `dedupe_key`; `service_rules.request`; `push_subscriptions` in `0005`; the import migration numbered `0010`; the Dibs map is JSON;
  - the Dockerfile layout and the CSP living in `proxy.ts`;
  - test file names; no toast component; the HEIC limit; the real Dibs parser waiting for Q6;
  - the seed closes Wednesday and Friday (Q5).
