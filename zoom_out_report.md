# Stage 5: Initial Zoom Out Review

*   **Target:** `docs/designs/fluffy_fur.md` (full file, lines 1–1782)
*   **Reviewer:** egm-zoom-out (Goldfish, no conversation context)
*   **Standard:** `zoom-out-standard.md`
*   **Date:** 2026-10-26
*   **Verdict:** Approve with changes. The architecture is right-sized: one
    image with two entry points, the no-overlap rule in Postgres, a database
    outbox instead of a queue service, and Cal.com and n8n rejected for
    stated reasons. M1–M4 should be fixed before Stage 6. The nits are
    optional trims.

The reviewer found no source code in the repository, so every component is
new. "Reuse" here means libraries and the platform.

## Major

### M1. The worker's deployment and network needs are assumed, never stated

*   **Where:** Shape of the system; file 15 (Dockerfile); file 66 (worker);
    Open Questions.
*   **Problem:** Almost everything runs on the worker: the outbox, hold
    release, owner alerts, the alert check, AI and photo cleanup. G4, G5 and
    G9 all depend on it. But the build brief says three things that conflict:
    *   The worker container is "prepared but switched off", with 256 MB.
    *   It is on the private network only, so it cannot reach the database
        gateway or the internet.
    *   `ffctl deploy` switches only the web container.

    So the worker could reach neither the database nor the providers, and
    after each release it would run a different version from web. The
    design also picks direct Postgres access, which the brief leaves "to
    settle with the server side".
*   **Suggestion:** Add an Open Question or dependency asking the server side
    for four things:
    1.  the worker switched on;
    2.  the worker able to reach the database and outbound HTTPS;
    3.  web and worker deployed and rolled back together at the same tag;
    4.  direct Postgres access (option a).

    If item 3 can't be guaranteed, say how the worker copes with being one
    version apart from web, for example by only ever adding outbox fields.
    State the worker's 256 MB limit in the NFRs.

### M2. The cost goal has no estimate behind it

*   **Where:** The Problem; G9 and G10; NFR Cost.
*   **Problem:** Paying less than Dibs is one of the three reasons for the
    project, and the concept brief named it the goal most likely to fail.
    The design adds several new costs:
    *   paid WhatsApp messages;
    *   a second number;
    *   email;
    *   AI;
    *   a one-off message to every imported customer.

    It asked for a cost estimate per booking, but the design only compares
    costs 8 weeks after launch. The caps stop runaway spending. They don't
    show the goal is met.
*   **Suggestion:** Add a short cost model:
    *   messages per booking by Meta category;
    *   fixed monthly costs (second number, email, AI cap, hosting share);
    *   the total, compared with the Dibs bill.

    Make "estimated monthly cost below Dibs at N bookings a month" a check
    before launch, and keep G10 as the measured confirmation.

### M3. Owner alerts have a second delivery path, so "one routing module" isn't true

*   **Where:** Messages; Owner alerts; files 30, 54, 59, 64, 67; the
    flowchart.
*   **Problem:** Channel decisions happen in four places:
    1.  Customer messages go through the outbox and `route()`.
    2.  Owner alerts are typed as outbox kinds, but file 67 reads
        `owner_events` and pushes directly.
    3.  The webhook decides the WhatsApp-to-email fallback, not `route()`.
    4.  Codes are sent from web, outside the outbox, while the flowchart
        shows the worker sending them.

    So retries, the "send once" rule and cost recording exist once per path,
    and the tests cover only the outbox path.
*   **Suggestion:** Use one pipeline:
    *   Owner pushes become outbox rows, queued in the same transaction as
        the `owner_events` row. `owner_events` stays the owner's record, not
        a queue.
    *   The webhook only records the status, and the worker calls `route()`
        for the next channel.
    *   Codes stay synchronous, but `issueCode` calls `route()` and writes an
        outbox row for cost and audit.
    *   Fix the flowchart.

### M4. The switch-day way back isn't real

*   **Where:** NFR Rollout & Rollback; CUJ 6; file 95.
*   **Problem:** "Dibs stays frozen for two weeks as the way back" doesn't
    say how bookings made on the new site would get back into Dibs. There is
    no export path back, and customers have already been sent their new
    links. Unfreezing Dibs on day 3 would lose or double-book every booking
    made on the new site.
*   **Suggestion:** Choose one:
    *   **A short go/no-go window.** For example, until the first new-site
        booking or 24 hours. After that, problems are fixed forward.
    *   **A reverse export.** A CSV of future bookings for entering into
        Dibs by hand, plus a notice to customers.

    Give it its own line in the launch checklist.

## Nits

### N1. `push_subscriptions` is built to hold customers

The table, its check rule and the merge logic all allow for customers,
though customer reminders are out of version 1. Make it `staff_id not null`
only, drop subscriptions from the merge function, and delete the "can
already hold a customer" lines (Q2, Alternative J). Adding customers later is
one migration.

### N2. Speculative extension points

*   **The groomer column.** It is needed by the no-overlap rule, so keep it,
    but describe it that way rather than as a plan for more groomers.
*   **Provider choice.** "Picked in settings" conflicts with `env.example`,
    which has no selector variable. Choose fake or real with an environment
    variable instead.
*   **`staff.role`.** Drop it unless something reads it.

### N3. The AI spending reservation is heavier than needed

Reserving the expected cost and then correcting it guards against overshooting
the cap by a fraction of a cent. Check that the month's actual spend plus a
small fixed margin is under the cap, then record the actual cost.

### N4. Dibs staging tables in the production schema

Permanent `import_dibs_*` tables serve a one-time job, and `dibs_ref unique`
already prevents duplicates. Parse in memory and write the report to a file,
or plan a later migration that drops the tables.

### N5. Server photo re-encoding is the heaviest memory path

Re-encoding 8 MB HEIC photos with `sharp` inside the 512 MB web container is
the most memory-hungry thing in the app. The ready-made `sharp` builds may not
decode HEIC (to verify). Have the browser output JPEG or WebP at 1280 px or
less, accept only that on the server, or move re-encoding to the worker. Drop
HEIC unless it is verified to work.

### N6. Counting clicks on outbound links is not specified

A direct `wa.me` link never reaches the server, so the server can't count
it. Name the mechanism: a small redirect route (`/go/whatsapp?product=`),
which also works without JavaScript, or `sendBeacon`.

### N7. Use the framework's form mechanism

Next.js Server Actions are the framework's own way to make forms work
without JavaScript, and they check the request's origin. Using them for the
booking steps and admin changes would remove the custom CSRF code and
several route files. Keep route handlers for JSON endpoints and webhooks.

### N8. Function-level detail is fixed too early, and it has already drifted

Exact function signatures freeze details the build session should own. Small
inconsistencies have already crept in:

*   The outbox unique key is (appointment, kind, channel) in the data model
    but adds `send_at` in file 21. With `send_at`, it no longer stops a
    reminder being queued twice unless `send_at` never changes.
*   The layout uses `src/app/`, where the build brief used `app/`.

Keep module responsibilities and interfaces, drop most signatures, and settle
the one outbox key.

### N9. "A second language means adding a JSON file" promises too much

`lang` and `dir` are fixed, message templates are Hebrew only, and no
language routing is planned. Reword to "interface strings are kept in
`he.json`".
