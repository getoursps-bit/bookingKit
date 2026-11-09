# Fluffy Fur: Salon Website with Online Booking

* **Author:** @Khalil
* **Date:** 2026-10-26

## Overview

Fluffy Fur is the website for one dog and cat grooming salon in Israel. It is
in Hebrew, laid out right to left, and runs on the salon's own domain. It
replaces the salon's Dibs booking page. The client asked for it so the salon
has its own brand and shows up in search results, with booking as one
feature of the site.

Customers arrive mostly from Instagram. On the site they can:

* read about the salon, its services, prices and working hours;
* look through the gallery and the products;
* book an appointment for one or more pets;
* view, cancel or move their appointment later through a private link.

Booking happens only on the website. WhatsApp sends the verification codes,
confirmations and reminders. Customers without WhatsApp get them by email or
call the salon. Products are shown for display only, each with an "Order on
WhatsApp" button. The site has no cart and no online checkout.

The owner runs the salon from a small admin area: calendar, working hours,
blocked time, services, products, gallery, salon details and customer records.
The developer builds campaign landing pages as fixed pages inside the site.

Automated messages (codes, confirmations, reminders) come from a separate
WhatsApp number used only for that. The salon's current number stays for
chats and "Order on WhatsApp".

The site also sends browser notifications:

* **Owner:** the owner adds the admin to their phone's home screen and gets
  alerts for new, moved and cancelled bookings, and for failed messages.
  An email backup covers the case where those alerts stop arriving.
* **Customers:** customers can opt in to an extra reminder. In version 1 it
  is sent on top of WhatsApp, never instead of it.

Browser notifications never carry verification codes. Section 8 gives the
rules for both.

Two AI features are planned as extras. Each can be switched on or off, and the
site must work fully without them:

1. **Photo analysis.** The customer can upload a pet photo while booking. The
   AI suggests species, breed, coat type and coat condition, and the customer
   confirms or corrects them.
2. **Pre-visit summary.** A short read-only note for the owner about each
   booking.

AI spending has a hard monthly limit of about 40 USD.

Dibs is switched off on one day, after its data has been imported.

Success means three things:

* fewer phone calls to the salon;
* lower running costs than Dibs;
* more bookings and WhatsApp chats arriving from Instagram.

## Analysis

Six independent reviewers, with no knowledge of our conversation, read the
concept from different angles. They agreed on the points below, listed with
the most serious first. Claims about outside services and Israeli law came
from the reviewers' general knowledge, not live sources. They are marked
"to verify" and must be checked before anyone relies on them.

### 1. The switch from Dibs is the riskiest single step, and it has no plan yet

Nobody knows what Dibs can export: customers, future appointments, notes or
message consent. Nobody knows the export format either. Without that, these
risks are unhandled:

* appointments already booked on Dibs could be lost;
* the same time slot could be booked in both systems;
* customers could get reminders from both systems;
* bookings made on Dibs between the export and the switch could be missed.

Dibs services also have names, while the new site picks a service from the
animal's species and weight. So each old service name needs a rule that
maps it to a new service.

**What it needs:**

* a sample export from Dibs as early as possible;
* a written cutover plan covering: freezing Dibs at a fixed time, importing
  future appointments as confirmed bookings, sending each moved customer
  their new private link, checking that no future appointment was lost,
  changing every link that points to Dibs (Instagram bio, Google Business
  Profile), and a way back if the switch fails.

### 2. WhatsApp's business service has slow outside steps and could cut the owner off from her own chats

Automated WhatsApp messages need Meta's business service, not the normal app.
That means several steps outside the developer's control, and each takes time:

* Meta verifies the business;
* Meta approves the sender name;
* someone chooses a message provider, or connects to Meta directly;
* Meta approves every Hebrew message template, and can reject one.

Start these steps before development, not at launch.

**Number conflict.** Connecting the salon's current number to the business
service may stop the owner from using that number in the normal WhatsApp app
on their phone. Customer chats from "Order on WhatsApp" and Instagram would
then land in an inbox the owner does not watch. Meta has a mode that allows
both on one number. Whether it works in Israel is to verify. The current
default is a second number used only for automated messages (see section 8).

**Code message limits.** Meta fixes the wording of verification-code
messages, and they cannot contain a link (to verify). So the private
appointment link has to go in a separate confirmation message.

**Cost abuse.** Attackers can make a site send thousands of code messages to
run up costs. The site must limit code requests per phone number, per
address and per day, and must have a monthly message limit.

### 3. The success goals cannot be measured yet, and "lower costs than Dibs" may fail

Nobody has recorded today's numbers: calls per week, the Dibs monthly bill,
or bookings that come from Instagram. Without them, there is no way to say
after launch whether the site worked.

Cost is the goal most likely to fail. Meta charges for each business message
it delivers (to verify: current Israeli prices). Codes, confirmations and
reminders are all paid. Add the provider's fee, email, AI, hosting and
maintenance, and the monthly total for one salon could be higher than Dibs.
A rough example from the review: 150 bookings a month means about 600 paid
messages.

**What it needs:**

* about four weeks of current numbers recorded before the switch;
* a cost estimate per booking;
* tracking tags on Instagram links;
* a "where did this booking come from" field;
* counting clicks on "Book" and "Order on WhatsApp";
* recognising returning customers on the same device, so they are not sent a
  new paid code on every visit;
* keeping reminder text strictly about the appointment, so Meta does not
  count it as marketing, which costs more.

### 4. Booking rules are not defined

The owner has to agree to a table of rules:

* how long a time slot is;
* the gap between pets and between visits;
* how far ahead customers can book, and how soon before the visit;
* the most pets per visit;
* what happens when a visit would run past closing time;
* how holidays and Saturdays are handled;
* whether bookings are confirmed at once or wait for the owner.

**Time-slot clash.** Two customers can pick the same slot while each waits
for a code. The site must hold the slot briefly while the code is pending,
then check again when the booking is saved.

**Phone and walk-in bookings.** "Call the salon" is the last fallback, but the
admin has no way for the owner to book for a caller or a walk-in. Bookings
made by phone would then sit outside the system and could clash with online
ones. The owner must be able to create, move and cancel bookings, skipping
code verification but using the same clash check. The owner must also be
able to lengthen a booking after seeing the pet.

### 5. Choosing the service from the animal's details mixes different things

"Dog under or over 10 kg, cat, puppy under 6 months, nail trim" combines
species, weight, age and a stand-alone service in one list. Several cases
have no answer:

* Which service does a 15 kg, 5-month-old puppy get?
* Do cats have weight groups?
* Is nail trim a service of its own, an extra, or both?
* What does a customer choose if they don't know the weight?

**What it needs:** keep the pet's details (species, age group, weight group)
apart from the list of services. Add a table the owner can edit that turns
those details into a service, a duration and a "from" price. Set a clear
order, for example age is checked before weight. The form then asks species,
then age, then weight.

### 6. Too much is planned for one launch

The concept holds about seven separate parts:

* the marketing site;
* the booking engine;
* customer identity and codes;
* messages;
* the owner admin;
* the Dibs migration;
* AI.

If any one is late, everything waits. Meta template approval is the most
likely to be late. Search ranking also needs months to build up. So there is
no reason to hold the marketing site back until booking is ready.

**Proposed order:**

| Stage | What ships |
| :---- | :--------- |
| 0 | Slow outside steps: domain, Meta verification, the automated WhatsApp number obtained and its sender name approved, templates sent for approval, sample Dibs export |
| 1 | Marketing site with gallery and products; the "Book" button still opens Dibs |
| 2 | Service list, available-time calculation, owner calendar and hours; admin installable on the owner's home screen |
| 3 | Codes, messages, the booking form, the private appointment link; owner alerts (browser notifications plus email backup) and the admin event list |
| 4 | Practice imports from Dibs, then the switch |
| 5 | AI extras, built before the switch (decided: AI is in version 1); customer browser reminders after the switch, if kept |

*Decided: one public launch. These stages are the build order only; stage 1
is not released on its own.*

### 7. Other gaps the reviewers raised

* **Build or buy.** Ready-made booking tools exist (Cal.com, SimplyBook,
  Setmore, Israeli tools with Hebrew and WhatsApp). They probably handle
  "several pets, durations added up" poorly, which may justify custom code.
  Either way, write down the comparison.
* **Customer identity.** If a customer can verify by phone one time and by
  email another, the same person becomes two customer records. The suggested
  fix: always ask for a phone number, treat email as a second contact, and
  give the owner a tool to merge duplicate records. A customer owns pets, and
  the pets are kept for the next visit. Each private link works for one
  booking only, expires at the appointment time, and stops working if the
  booking is cancelled.
* **Cancellation and no-show rules.** These are missing:
  * how late a customer can cancel or move;
  * how many times they can move;
  * how no-shows are recorded;
  * how many future bookings one customer can hold;
  * what happens to the others when one pet in a multi-pet visit is cancelled.
* **Law.** Israeli law covers four areas (to verify):
  * The privacy law (Amendment 13) needs a Hebrew notice on the booking form,
    rules for data sent abroad (Meta, AI and email providers), and a way to
    delete or export a customer.
  * The anti-spam law needs separate consent for marketing messages.
  * The accessibility standard (IS 5568) and a published accessibility
    statement are required, and lawsuits are common. They must cover the
    booking flow and the admin.
  * Photos need consent, a retention period, and location data removed.
* **AI extras.** One reviewer would drop both from version 1, because
  neither serves a success goal. The others would keep them under these rules:
  * the analysis runs after the booking is saved, never during it;
  * failures are silent;
  * the site counts its own spending and switches the AI off at the limit;
  * coat condition uses a fixed list of words;
  * the AI never comments on skin, injuries or parasites;
  * the wording says the owner will assess the pet and set the final price.

  Cost is not the real risk; one photo likely costs well under a cent (to
  verify). The real risks are wrong guesses, and price expectations set by
  the word "matted". The pre-visit summary also has no defined actions, so
  version 1 should store plain text and say it has none.
* **Admin.** Split the admin into three parts. The scheduling part (calendar,
  hours, blocked time, services) has to be ready before the switch. The
  content part (products, gallery, salon details) could use an off-the-shelf
  content tool. Customer records are the third part. These owner workflows
  are missing:
  * being told about new, moved and cancelled bookings (now covered by
    owner alerts, section 8);
  * cancelling a whole day at once, with customers notified;
  * a warning when blocked time covers existing bookings;
  * a list of messages that failed to send;
  * admin login with recovery and a second factor.
* **Hebrew and search.** Phone numbers, prices, times and "kg" need care
  inside right-to-left text. Dates show day first, and weeks start on Sunday.
  "Order on WhatsApp" links need the number without the plus sign or leading
  zero, and Hebrew text encoded inside the link. For search, the Google
  Business Profile booking link probably matters more than anything on the
  page. Decide early whether page addresses are Hebrew or English.

### 8. Browser notifications and the WhatsApp number

These two additions went through a second review by all six reviewers. They
agreed that the owner alerts are worth keeping, that customer browser
reminders save little money, and that the brief contradicted itself on how
messages are routed. The rules below fix that.

**Why customer browser reminders save little.** Most customers arrive inside
Instagram's built-in browser, which cannot ask for notification permission.
On iPhone, a site can only send notifications after it has been added to the
home screen, and the home-screen copy opens on its own start page and loses
the booking it came from. Many people refuse the prompt. Reminders are also
the cheapest kind of message; codes and confirmations still go over WhatsApp.
In practice, uptake will mostly come from Android phones using Chrome. The
cost estimate therefore counts zero savings from browser notifications until
real figures exist.

**Browser notifications give no delivery receipt.** When the push service
accepts a message, that does not mean it reached the phone. A dead
subscription only shows up as an error on a later send. So the site cannot
know beforehand whether a subscription works. The only reliable signal is a
receipt the site builds itself: the page's background script reports back
when a notification arrives or is tapped.

**Routing rule for version 1 (one rule, used everywhere in this brief):**

| Message | WhatsApp (automated number) | Browser notification | Email | Last resort |
| :------ | :-------------------------- | :------------------- | :---- | :---------- |
| Verification code | Always first | Never | If WhatsApp fails | Call the salon |
| Confirmation with private link | Always | Never | If WhatsApp fails | Owner's failed-messages list |
| Reminder | Always | Extra copy, if the customer opted in | If WhatsApp fails | Owner's failed-messages list |
| Customer moved or cancelled | Always | Never | If WhatsApp fails | Owner's failed-messages list |
| Owner cancelled or moved a booking (including whole days) | Always | Never | If WhatsApp fails | Owner phones the customer |
| Owner alert (new, moved, cancelled booking; failed message; reply received) | Not used | Primary | Backup (see below) | Admin event list |

A later version may let a browser reminder replace the WhatsApp reminder.
Only on this condition: the browser notification goes out early, and
WhatsApp follows automatically if no receipt or tap comes back in time. That
change waits for measured uptake.

**Owner alerts: the case for browser notifications, with a backup.** The
owner is one person on one or two devices, set up once. That closes the gap
the first review found: the owner had no way to learn about new bookings.
But the owner's subscription can also stop without warning, for example
after a new phone, a cleared browser, Focus mode or a deleted home-screen
icon. So:

* The admin keeps a stored list of events (bookings, failed messages,
  customer replies) with read and unread marks. That list is the record;
  a browser notification only points to it.
* The admin shows "alerts last received on this device at …" and has a
  "send a test" button. More than one owner device is allowed.
* A daily check notification must be received back. If not, the owner gets
  an email: "alerts on your phone have stopped."
* Lock-screen text stays minimal ("New booking, Tue 10:00"), with no
  customer or pet names. Details appear only after opening the admin.
* The admin login, including the second factor, must work inside the
  home-screen app, which keeps its own storage, separate from the browser.
* The admin and the public site are installed separately, each with its
  own name, icon and scope.
* Bookings imported from Dibs, and bookings the owner enters, never trigger
  alerts.
* The pre-visit summary is not pushed. It appears in the admin, and only
  when the AI extra is on.

**Customer browser reminders: rules if kept.**

* The opt-in shows only where it can work. It is hidden inside Instagram's
  browser, and iPhone customers are never asked to install a home-screen
  app. It is a button the customer taps, never a prompt on page load. It
  sits on the private-link page, which customers often open later from
  WhatsApp in a normal browser.
* The opt-in is a normal, dismissible part of the page, not a pop-up. It
  works with a keyboard and is read by screen readers, as IS 5568 requires.
* A subscription belongs to the customer record, one per device. It moves
  with the customer when records are merged, and is deleted when the
  customer is deleted. Cancelled bookings never get reminders, and each
  reminder goes at most once per booking.
* The site records its own consent entry (purpose: appointment reminders
  only; time; device). Browser notifications are never used for marketing.
  The privacy notice lists the push services abroad (Apple, Google,
  Mozilla) as recipients.
* The customer can turn reminders off from the private-link page.

**The automated WhatsApp number: what it needs.**

* **It is a launch decision, not a setting.** Meta's verification, sender
  name, quality rating and sending limits belong to each number. Switching
  later repeats those steps. The site keeps two separate settings from day
  one: the automated sender number, and the chat number used in "Order on
  WhatsApp" and contact buttons. The one-number case uses the same value in
  both.
* **Registration.** The number is owned by the salon, not the developer. It
  can receive an SMS or voice call, and it is never used in a WhatsApp app.
  Record who holds the SIM and the two-step PIN. It needs its own
  sender-name review, which adds time to stage 0. Its monthly cost goes into
  the cost estimate. Templates approved on the salon's business account
  work for it (to verify).
* **Customer trust.** Messages with links from an unknown number look like
  the scams that are common in Israel, and blocks or reports lower the
  number's standing with Meta. The automated number gets the salon's name
  and logo. The booking form and confirmation page say "messages will come
  from 05X-…". Before the Dibs switch, the main number or Instagram tells
  customers the new number is coming.
* **Replies.** Customers will reply "running late" or "can't make it."
  Every confirmation and reminder carries the private link to cancel or
  move, and a "Chat with the salon" button that opens the main number.
  Incoming replies are stored and shown to the owner as an event, so none
  are lost. One fixed automatic answer goes out at most once a day per
  customer. It is a fixed text, not a chat bot, and it never reads the
  reply. Opt-out words such as "stop" are honoured and recorded. Replies
  inside Meta's 24-hour window may make follow-up messages free (to
  verify).
* **Consent.** Consent given to Dibs does not cover the new number (to
  verify). The booking form names the automated number and records opt-in
  for it. Imported customers only receive appointment messages for their
  existing bookings until they book again, and the legal basis for this is
  recorded.
* **When the number fails.** If it is restricted, a template is rejected or
  the provider is down, an admin switch sends codes and messages through
  email instead and shows a notice on the booking page.
* **Measuring.** "More WhatsApp chats from Instagram" counts only the main
  number. Replies to the automated number are counted separately, as a sign
  of friction.

### Where the reviewers disagreed

These choices are yours. Items 1 to 3 are now decided (see Key
Decisions): codes at booking, email fallback with a call button, and AI in
version 1.

1. **Codes at booking.** Most reviewers would keep code verification at
   booking. One would skip it in version 1 and ask for a code only when the
   customer opens their private link, which saves message costs.
2. **Fallback channel.** Email (your choice), SMS, or no automatic fallback
   with "call the salon" only. Most people in Israel use WhatsApp.
3. **AI in version 1.** Drop both extras, or keep them under the rules above.
4. **Booking engine.** A ready-made tool, or custom code for the several-pets
   case.
5. **Content admin.** Custom pages in the admin, or an off-the-shelf content
   tool.
6. **Customer browser reminders.** One reviewer would drop them from
   version 1, because the saving is small and the work is real. The others
   would keep them after the switch, as an extra, behind their own on/off
   switch.
7. **Owner backup channel.** Email (current choice), a free phone app
   channel such as a Telegram bot or ntfy, or a calendar feed the owner
   subscribes to.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Hebrew right-to-left website on the salon's own domain, built for search:
    salon details, contact buttons, gallery, services with "from" prices and
    durations, working hours, products.
  * Products shown for display, each with an "Order on WhatsApp" button.
  * Campaign landing pages built by the developer as fixed pages.
  * Online booking for one or more pets per visit, with the service chosen
    from each pet's details. One groomer, one booking at a time.
  * Verification codes, confirmations and reminders over WhatsApp, from a
    separate automated number. Email for customers without WhatsApp. "Call
    the salon" as the last option. The routing table in section 8 is the
    single rule.
  * Owner alerts by browser notification, with a stored event list in the
    admin and an email backup.
  * Optional customer browser reminders, after the switch, always on top of
    WhatsApp in version 1, never carrying codes.
  * A private link to view, cancel or move a booking, with no account.
  * Owner admin: calendar, hours, blocked time, services, products, gallery,
    salon details, customer records, and booking for phone and walk-in
    customers.
  * Tracking where bookings and WhatsApp chats come from.
  * A one-day switch from Dibs, with Dibs data imported first.
  * Accessibility to the Israeli standard (IS 5568) and the privacy law.
  * AI extras (photo analysis, read-only pre-visit summary), each switchable,
    with a hard monthly spending limit. They never block booking.
* **Out-of-Scope Non-Goals:**
  * Cart, checkout, online payment or any online selling. Payment is taken at
    the salon.
  * Booking by chatting in WhatsApp, or a WhatsApp chat bot. The only
    exception is one fixed automatic answer on the automated number, which
    never reads the reply.
  * Browser notifications for marketing.
  * AI writing pages or content, or the owner building pages.
  * AI choosing the service or price, or making health claims.
  * Customer accounts with passwords.
  * More than one groomer, or more than one branch.
  * Languages other than Hebrew at launch.
  * Running Dibs and the new site side by side.
  * Server and infrastructure design. That is covered in the separate build
    brief.

## Key Decisions & Staging for Next Steps

**Already decided:**

* The site exists for branding and search presence. Booking is one feature
  of it.
* Booking happens only on the website. WhatsApp only carries messages and
  product enquiries.
* Browser notifications are added. Owner alerts are the main use. For
  customers they are an optional extra on top of WhatsApp, and the cost
  estimate counts no saving from them.
* No online selling of any kind.
* Landing pages are fixed pages built by the developer.
* AI is optional, switchable, capped in cost, and never blocks booking. The
  pre-visit summary is read-only in version 1.
* Dibs is replaced on one day. The migration is planned in detail later, but
  the data model must accept imported customers from the start.
* Cost: start with the minimum. Send codes only when needed.
* **One launch.** Everything goes live together on switch day. The stages in
  section 6 remain the build order, but nothing is public before the
  switch. Accepted cost: search ranking starts building only at launch, and
  a delay in any part (Meta template approval, the Dibs import) delays the
  whole launch.
* **Codes at booking.** A verification code is sent at every booking, apart
  from returning customers recognised on the same device.
* **Fallback is email.** If WhatsApp fails, the code and messages go by
  email. Every fallback screen also shows a "Call the salon" button.
* **Build the booking engine.** No free self-hosted engine fits:
  Cal.com is the only one on the same stack, and it does not handle several
  pets per booking, is too heavy for the container limit, and is AGPL
  licensed. The PHP tools (Easy!Appointments, LibreBooking) do not fit the
  stack. The custom engine uses free parts: Postgres for the no-overlap
  rule, FullCalendar (MIT, Hebrew and right-to-left) for the owner
  calendar, and date-fns-tz for Israel time.
* **AI is in version 1.** Photo analysis and the pre-visit summary ship at
  launch, still switchable, capped in cost, and never blocking booking. The
  AI rules in section 7 are binding.

**Decide before `/egm-draft`:**

1. Whether to use a custom content admin or an off-the-shelf tool. (The
   booking engine is decided: build it, see Already decided.)
2. The WhatsApp number, before templates are sent for approval in stage 0.
   The default is a separate automated number. Choose one number instead
   only if Meta's one-number mode works in Israel and the owner uses the
   WhatsApp Business app.
3. Whether customer browser reminders stay in scope at all.

**Start now, because they take time:**

* Ask Dibs for a sample data export.
* Start Meta business verification.
* Get the automated WhatsApp number in the salon's name. Check that it can
  receive SMS or voice calls, record who holds it, and send its sender name
  for review.
* Check whether Meta's one-number mode works in Israel, and which WhatsApp
  app the salon uses today. The answer feeds decision 6.
* Record current numbers: Dibs monthly cost, calls per week, bookings per
  week and how many come from Instagram.
* Ask the owner for the booking rules (slot length, gaps, notice, maximum
  pets, cancellation cutoff) and the service rules (puppy over 10 kg, nail
  trim as an extra, cats).
