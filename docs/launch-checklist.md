# Launch checklist (switch day)

Gates are checks, not dates. Tick each one; if one fails, stop and fix it
before the next. Commands run inside the app container
(`docker exec -it <container> sh`) unless noted.

## Before the day

- [ ] **Providers chosen and keys set** on the server `.env` with `PROVIDERS=real`:
      storage, WhatsApp, email, push (VAPID), and AI if wanted. A service is
      either fully set or left empty; a partly filled one stops start-up.
- [ ] **AI model confirmed with the owner** before the first paid call:
      `AI_MODEL` plus its two prices (`AI_PRICE_INPUT_AGOROT_PER_MTOK`,
      `AI_PRICE_OUTPUT_AGOROT_PER_MTOK`). The switches in Settings stay off
      until the owner turns them on.
- [ ] **Meta templates approved**, in Hebrew, with the same names as in
      `db/seed/data.he.json`: `ff_code` (authentication, copy-code button),
      `ff_confirmation`, `ff_reminder`, `ff_customer_change`, `ff_owner_change`,
      `ff_import_link` (utility, URL button `https://<domain>/b/{{1}}`).
      Sender display name set.
- [ ] **Both WhatsApp numbers set** in Admin → Settings: the automated sender
      and the salon's chat number (the auto-reply points to it).
- [ ] **Webhook** registered in Meta at `https://<domain>/api/webhooks/whatsapp`
      with `WHATSAPP_VERIFY_TOKEN`; the verify request answers 200.
- [ ] **Migrations and seed**: `node worker/migrate.js --check` lists nothing
      pending after `node worker/migrate.js` and `node worker/seed.js`.
- [ ] **Owner account**: `node worker/staff-create.js <email>`, key added to
      the owner's authenticator app, login tested, the admin app installed on
      the owner's phone, alerts enabled, and "send test" arrives.
- [ ] **Content checked by the owner**: services and prices, rules, hours,
      time off, products, gallery (with consent), salon details, privacy and
      accessibility pages.
- [ ] **Practice import passed**: `node worker/import-dibs.js <export.csv> --dry-run`
      on a recent Dibs export. The report has no bad phones, bad times,
      unmapped services or clashes that are not understood. Fix the column
      names and service map in a copy of `db/seed/dibs-service-map.json` and
      pass it with `--map=<file>` if needed.
- [ ] **Way back tested**: `node worker/import-dibs.js --export-future=/tmp/future.csv`
      opens in Excel with Hebrew intact.
- [ ] **Backups**: a database backup taken and a restore tried once.

## On the day

- [ ] **Dibs frozen** at a set time; note it as `<freeze>` (for example
      `2026-11-15T20:00:00+02:00`).
- [ ] **Final export imported**:
      `node worker/import-dibs.js <final.csv> --freeze-time=<freeze>`.
      In the report, `futureInDibs` minus the listed problems equals
      `futureInNewSystem`, and `refusedByOverlap` is 0. Spot-check a few
      bookings in the calendar.
- [ ] **New links queued**: `node worker/import-dibs.js --queue-links`. The
      worker sends them 30 every 10 minutes; watch Admin → Messages for
      failures and call those customers.
- [ ] **Search engines**: Admin → Settings → turn off "hide the site from
      search engines".
- [ ] **Password gate removed** from the proxy (Traefik) for the production
      domain; `/api/webhooks/` stays on its own route and rate limit.
- [ ] **Sitemap submitted** in Google Search Console (`https://<domain>/sitemap.xml`).
- [ ] **Links changed**: Instagram bio, Google Business Profile, Facebook and
      any other place that pointed to Dibs now point to the new site.

## Go/no-go window

- [ ] Watched for 24 hours, or until the first booking made on the new site,
      whichever is later: bookings arrive, codes and confirmations are
      delivered, owner alerts arrive, no errors in the logs.
- [ ] Window closed: the decision (stay, or go back to Dibs with the exported
      CSV) noted with the time.
