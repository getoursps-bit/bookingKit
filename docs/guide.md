# Fluffy Fur: setup and usage guide

This guide is for the person who runs the app (setup, first run, updates) and
for the salon owner (daily use). Developer setup on a laptop is in
[`README.md`](../README.md); the switch-day steps from Dibs are in
[`launch-checklist.md`](launch-checklist.md).

Every screen can be shown in English: use the **English / עברית** link in the
site header, the phone menu, the footer, or the owner area's menu.

---

## Part 1. Setting up the server

### What runs

One Docker image (`ghcr.io/getoursps-bit/fluffyfare:<commit>`), started twice:

| Container | Command | Job |
| --- | --- | --- |
| web | `node server.js` | The website, booking and owner area. Health check: `GET /healthz` |
| worker | `node worker/main.js` | Sends messages, reminders, the nightly clean-up, AI jobs |

Both read the same environment variables and the same Postgres database.
Nothing is stored inside the containers, so they can be replaced at any time.
CI builds a new image for every merge into `main`; the tag is the commit.

### 1. Environment file

Copy [`env.example`](../env.example) to the server's `.env` and fill it in.
Never commit the filled-in copy.

| Variable | What to put |
| --- | --- |
| `APP_BASE_URL` | The public address, e.g. `https://flfy.gtechvps.dev`. Used in every link and message |
| `SESSION_SECRET` | `openssl rand -hex 32`. Changing it logs everyone out and breaks old private links |
| `DATABASE_URL` | The app's own restricted Postgres role (rights on the `fluffyfur` schema only) |
| `PROVIDERS` | `real` on the server. `fake` only on a laptop or in CI |
| `SITE_NOINDEX` | `true` until launch day |

Each outside service is **all or nothing**: fill in all its keys to switch it
on, or leave them all empty to switch it off. A partly filled service stops the
app from starting, with a message naming the missing key.

| Service | Keys | If left empty |
| --- | --- | --- |
| Photo storage | `STORAGE_*` | No gallery or pet photo uploads |
| WhatsApp | `WHATSAPP_*`, `WEBHOOK_SECRET_MESSAGING` | Online booking shows "call the salon" instead (unless email is on) |
| Email | `EMAIL_*` | No email codes or messages |
| Owner alerts | `VAPID_*` (generate once: `npx web-push generate-vapid-keys`; never change them) | No phone alerts |
| AI | `AI_API_KEY`, `AI_MODEL`, `AI_PRICE_*` | AI switches in Settings stay greyed out |

The site, hours, services and the owner area work with no outside service at
all. Booking needs at least WhatsApp or email to send the code.

### 2. Database: migrate and seed

Run inside the web container (`docker exec -it <web-container> sh`):

```sh
node worker/migrate.js --check   # lists pending migrations
node worker/migrate.js           # applies them
node worker/seed.js              # starting content in Hebrew and English
```

Both are safe to run again. The seed never overwrites anything the owner has
edited; it only fills empty fields. Migrations never run by themselves when
the app starts, so **after every update, run `migrate.js --check`**.

### 3. Owner account

The owner runs this themselves, because it asks for a password and prints a
secret key:

```sh
node worker/staff-create.js owner@example.com
```

Add the printed key to an authenticator app (Google Authenticator, 1Password,
Microsoft Authenticator). Running the command again for the same email resets
the password and the key.

### 4. Email (set this up first)

Booking needs a way to send the 6-digit code. Email takes minutes to set up;
WhatsApp takes days because Meta reviews the templates. With email only, the
email field on the booking form becomes required and the code goes there.
Once WhatsApp is on, it is tried first and email becomes the fallback.

The app posts to one HTTPS address with `Authorization: Bearer <key>` and a
JSON body of `from`, `to` (a list), `subject`, `html` and `text`. That is
Resend's request format (`https://api.resend.com/emails`); a service with a
different format needs a small adapter in `src/server/notify/email.ts`.

1. Create an account with the email service and **verify the sending domain**
   by adding the SPF and DKIM DNS records it shows. Without them, mail goes to
   spam or is refused.
2. Create an API key that can send.
3. Set all three in `.env` (a partly filled service stops start-up):

   ```
   EMAIL_API_URL=https://api.resend.com/emails
   EMAIL_API_KEY=<key>
   EMAIL_FROM=Fluffy Fur <no-reply@your-verified-domain>
   ```

4. Restart the containers (`.env` is read only at start), then book at
   `https://<domain>/en/book` with your own email and enter the code.

### 5. WhatsApp (Meta Cloud API)

1. **Meta Business account** at business.facebook.com, then a Meta app of type
   "Business" with the **WhatsApp** product added.
2. **Sender number**: add the salon's *automated* number in WhatsApp Manager
   and verify it. It must not be in use on the WhatsApp phone app. The salon's
   normal chat number stays separate.
3. **Permanent token**: Business Settings → System users → add one with the
   WhatsApp permissions and generate a token. The temporary token on the
   setup page expires after 24 hours.
4. **Templates**: create these in WhatsApp Manager, language **Hebrew**, with
   the wording from `db/seed/data.he.json`. Each `{word}` becomes `{{1}}`,
   `{{2}}`... in the order it appears.

   | Name | Category | Button |
   | --- | --- | --- |
   | `ff_code` | Authentication | Copy code |
   | `ff_confirmation`, `ff_reminder`, `ff_customer_change`, `ff_owner_change`, `ff_import_link` | Utility | URL `https://<domain>/b/{{1}}` |

   For English customers, add an **English** version of each template
   (wording in `db/seed/data.en.json`) with the button URL
   `https://<domain>/en/b/{{1}}`. Until a template is approved in English,
   leave its English WhatsApp wording empty in the owner area: English
   customers then get the Hebrew message, which always works.
5. **Webhook**: app → WhatsApp → Configuration. URL
   `https://<domain>/api/webhooks/whatsapp`, verify token = any random text you
   choose (the same text goes in `WHATSAPP_VERIFY_TOKEN`), and subscribe to the
   **messages** field. This path must not sit behind the showcase password
   gate.
6. **`.env`** (all five together):

   ```
   WHATSAPP_API_TOKEN=<permanent system-user token>
   WHATSAPP_PHONE_NUMBER_ID=<WhatsApp Manager → phone numbers>
   WHATSAPP_BUSINESS_ACCOUNT_ID=<WhatsApp Business Account ID>
   WEBHOOK_SECRET_MESSAGING=<App settings → Basic → App secret>
   WHATSAPP_VERIFY_TOKEN=<the text from step 5>
   ```

7. Restart, then in the owner area → **Settings → WhatsApp numbers** enter the
   sender number and the salon's chat number.
8. Book with your own phone. If no code arrives, look in the owner area →
   Messages → Failed messages and in the logs; "no approved template" means a
   template is missing or still in review.

### 6. Check it works

- `https://<domain>/healthz` answers 200.
- The home page opens at `/` (Hebrew) and `/en` (English).
- Log in at `/admin`, turn on alerts on the owner's phone, press **Send a test
  notification**.
- Make one booking with your own phone or email, then cancel it from the link
  in the confirmation.

### Updating to a new version

1. Merge the pull request into `main` and wait for the `image` job in GitHub
   Actions (it pushes the image only if every check and smoke test passed).
   The tag is the commit: `git fetch origin && git rev-parse origin/main`.
2. One time only, if the GitHub package is private: on the server,
   `docker login ghcr.io -u <github user>` with a token that has
   `read:packages`.
3. On the server, migrate with the **new** image before switching. Use the
   network `fluffyfur_web` reaches the database on (`docker inspect fluffyfur_web`):

   ```sh
   cd ~/Containers/fluffyfur
   TAG=<commit>
   IMG=ghcr.io/getoursps-bit/fluffyfare:$TAG
   docker run --rm --env-file .env --network <network> $IMG node worker/migrate.js --check
   docker run --rm --env-file .env --network <network> $IMG node worker/migrate.js
   # only when docs/build-notes.md says new content was added:
   docker run --rm --env-file .env --network <network> $IMG node worker/seed.js
   ```

4. Switch: `bin/ffctl deploy $TAG`, then `bin/ffctl status`. Check that the
   worker moved to the same tag too.
5. Open `/healthz`, the home page, and `/admin`.

To go back: `bin/ffctl rollback`. Migrations only ever add things, so the
older version still runs on the newer database.

---

## Part 2. Daily use (owner)

Open `/admin` on the phone and add it to the Home Screen (Share → Add to Home
Screen on iPhone; the install prompt on Android). It then opens like an app and
can show alerts. Log in either with email, password and the 6-digit code from
the authenticator app, or with **Log in with a code by email** (enter the
email, then the code that arrives there). The owner's email account should
have its own two-step check, since it now opens the admin too.

The menu has eight screens.

### Today

- **Upcoming appointments**: who is coming, with pets, services and notes
  (and an AI summary, if switched on).
- **New updates**: new bookings, changes and cancellations made by customers.
  Mark them as read once seen.
- **Messages that weren't sent**: a confirmation or reminder that failed.
  Call these customers.
- **Device notifications**: turn alerts on for this phone, send a test, or
  remove an old device.

### Calendar

- Day, week and month views. Tap an appointment to see its details and to
  mark it **Arrived – done**, **No-show**, **Extend by 15 minutes**, or
  **Cancel and notify customer**.
- **Drag** an appointment to a new time to move it; the customer gets a
  message. If the time is taken, it snaps back.
- **New appointment** (or tap an empty time): for phone and walk-in bookings.
  Tick "Send the customer a confirmation" to send them their private link.
- Two bookings can never overlap; the database refuses it.

### Messages

- **Updates**: the same list as on Today, in full.
- **Messages received**: what customers wrote to the automated WhatsApp number.
  They already got an automatic answer pointing to the salon's chat number.
- **Failed messages**: everything that could not be delivered.

### Customers

Search by name or phone. Each customer shows pets, appointments, internal
notes (never shown to the customer) and consents. You can also:

- **Merge** two records of the same person.
- **Export all data** when a customer asks for a copy of their data.
- **Delete personal data** when a customer asks: name and phone are removed,
  the history stays without them. This cannot be undone.

### Stats

How the salon is doing, for the last 7, 30 or 90 days:

- **Bookings made**: online, by the salon, and imported; how many were
  cancelled; visits held and no-shows.
- **"Book" clicks** and how many of them ended in an online booking, and
  clicks on "Order on WhatsApp" for products.
- **Messages sent** by WhatsApp, email and alerts, what they cost, failed
  messages, and AI spending this month.
- **Bookings made each week** over the last 12 weeks (with a table view).
- **Where online bookings came from**: the campaign tag in the link the
  customer arrived on. Add `?utm_source=instagram` (or `facebook`, `tiktok`)
  to the links you post, for example
  `https://<domain>/l/dog-grooming?utm_source=instagram`, so each source is
  counted separately. Bookings without a tag show as "Direct".
- **Most-booked services**: pets per service for visits in the period.

Nothing here uses cookies for tracking or any outside analytics service; the
numbers come from the bookings, clicks and messages the app already stores.

### Content

Everything shown on the website. Every item has an English field next to the
Hebrew one; leave it empty and the site shows the Hebrew text in English too.

- **Services & prices**: name, what's included, duration, starting price,
  whether it can be booked online, active, order.
- **Which service for each pet**: the rules that choose the service from what
  the customer answers (dog or cat, age, weight, full grooming or nails). This
  also decides how long the appointment is.
- **Products**: name, description, price and a photo. Open a product to add,
  replace or remove its photo. Customers order through the salon's WhatsApp
  chat.
- **Gallery**: choose one or several photos and upload them; no text is
  needed. To add a description and caption, tick the box first; they are saved
  for every photo in that upload. Every uploaded photo shows on the site, so
  upload only photos you may publish.
- **Salon details**: cover photo for the top of the home page, name, tagline,
  city, address, phone, social links. Without a cover the site shows a paw.
  (The logo can't be uploaded from the owner area yet.)
- **Message wording**: email and alert texts can be edited. Keep the words in
  curly braces, like `{when}` or `{link}`; they are filled in automatically.
  WhatsApp wording is fixed by the template Meta approved.

### Hours

The weekly opening hours, and **time off** (holidays, a closed afternoon).
Time off removes those times from online booking; existing bookings in that
time are not touched, so move or cancel them yourself.

### Settings

- **Booking rules**: interval between start times, break between pets,
  clean-up time, minimum notice, how many days ahead, maximum pets, how late
  customers can change or cancel, and how long a time is held while the code
  is entered.
- **Switches**: AI photo analysis and AI summary (off by default), "WhatsApp
  is down – send everything by email", and "hide the site from search
  engines" (turn off on launch day).
- **WhatsApp numbers**: the automated sender and the salon chat number.
- **Monthly limits**: the most messages and the most AI spend per month.

---

## Part 3. What customers see

1. **Book** (`/book` or `/en/book`) in four steps: pets → time → name and
   phone → code. The code comes by WhatsApp (or email). No account, no
   password.
2. A confirmation with a **private link** (`/b/<code>`). On that page they can
   see the booking, move it, cancel it (until the
   cut-off in Settings), and add a pet photo if that is switched on.
3. A **reminder** the day before.
4. Customers who book in English get every message, date and link in English.

---

## Part 4. Testing in English

You do not need to read Hebrew to test everything:

1. Open `https://<domain>/en`. All public pages, booking and the private link
   are in English.
2. In the owner area, use **English** in the menu (or on the login page). The
   choice is remembered on that browser.
3. Make a booking at `/en/book` with your own number. The code, confirmation
   and reminder come in English (WhatsApp in English only once the English
   templates are approved; otherwise in Hebrew, see Part 1 step 4).
4. To check the Hebrew side, switch back with **עברית** and compare the same
   pages; the layout mirrors from right to left.

---

## Part 5. When something goes wrong

| What you see | What to do |
| --- | --- |
| App does not start, log names a missing key | A service is partly filled in `.env`. Fill all its keys or empty them all |
| Booking page says "call the salon" | No way to send codes: check the WhatsApp or email keys, or the "WhatsApp is down" switch |
| Customers say the code never came | Owner area → Messages → Failed messages. If WhatsApp is down, turn on "send everything by email" |
| No alerts on the owner's phone | Today → Device notifications → Send a test. On iPhone the admin must be added to the Home Screen first |
| "That time is taken" when moving | Another booking or time off is there; pick another time |
| English customer got a Hebrew WhatsApp | Expected until that template is approved in English in Meta and its English wording is filled in |
| Errors after an update | Run `node worker/migrate.js --check` and apply anything pending |
| Lost the authenticator phone | Log in with a code by email; or run `node worker/staff-create.js <email>` again on the server to reset password and key |
| The login code email does not arrive | Check spam; owner area → Messages; three sends per 15 minutes, then wait |
