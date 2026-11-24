# Requirements: step 4

What the owner of the kit asked for, the decisions made while discussing it
(2026-11-18 to 2026-11-24), and how to tell each requirement is met. The
design that says **how** to build them is
[`designs/step4_owner_platform.md`](designs/step4_owner_platform.md); this
file says **what** must be true. If the two disagree, this file wins and
the design is corrected.

Each requirement has an id (`R<part>.<n>`). Refer to the id in commits,
build notes and module specs.

## Decisions by the owner of the kit

These are fixed. Change one only when the owner of the kit says so, and
record the new date.

| Id | Decision | Date |
|---|---|---|
| D1 | Everything is built **in the kit**, and every client project receives it through `pnpm kit update`. Nothing in this list is built in one client's repo. | 2026-11-18 |
| D2 | **The core is only** customers, bookings (with their lines), services, opening hours, days off, the website's content (profile, pages, gallery, product catalogue) and the platform (staff and roles, settings, messages, translation, files, audit, events). | 2026-11-18 |
| D3 | Everything else is a **module** (an extension, `extensions/<id>/`): payments, accounting, invoices, shop, courses, advanced statistics, MCP, webhooks, connectors, extra notification channels. Each is switched on or off per client, works with the core's entities through fixed extension points, and is controlled by its own spec, `extensions/<id>/SPEC.md`. | 2026-11-18 |
| D4 | **Payment starts as cash.** The customer pays in person; the owner records the payment and updates its status in the system. Online payment comes later, as a driver of the same `payments` module. | 2026-11-18 |
| D5 | The owner needs a **simple accountant** beside the bookings: income, expenses, profit, what is owed, and export. Not full accounting. | 2026-11-18 |
| D6 | The kit is **not made mainly for Israel**. No country's tax or invoice rules are built in. Invoices and orders **can be deleted**, one at a time and in bulk. | 2026-11-18 |
| D7 | Currency, time zone and country become per-client settings; Israel (ILS, Asia/Jerusalem, +972) stays the default so existing clients do not change. | 2026-11-18 |
| D8 | Admin access for more people is a **paid tier**: the number of staff seats is limited per client, and each user has permissions. | 2026-11-18 |

## R1. The customers page lists customers (bug)

Today the owner's customers page is empty until she searches.

| Id | Requirement | Met when |
|---|---|---|
| R1.1 | The customers page lists every customer who is not erased, without a search. | Opening `/admin/customers` with no search shows customers |
| R1.2 | The list is paged and sortable (name, last visit, number of bookings); newest visit first by default. | 1,000 seeded customers load page by page; each sort works |
| R1.3 | Search filters the same list by name or phone. | Typing part of a name or 3+ digits of a phone narrows the list |
| R1.4 | Each row shows name, phone, number of bookings, last visit, next booking, and opens the customer record. | |
| R1.5 | Works without JavaScript and at phone width, right to left and left to right. | Browser test at phone width passes |

Layer: core. Decision needed: none.

## R2. Delete, one and many

| Id | Requirement | Met when |
|---|---|---|
| R2.1 | The owner can delete **bookings**, **days off**, **orders** and **invoices**, one at a time. | Each has a delete action that asks for confirmation |
| R2.2 | The same items can be deleted **in bulk**: tick several (or all on the page), then one action. | Deleting 20 items is one action and one confirmation |
| R2.3 | Bulk actions are one shared pattern in the core that modules reuse (`bulkActions` point), not code per screen. | Orders and invoices use the same pattern as bookings |
| R2.4 | A booking that still holds a time is cancelled before it can be deleted, so the customer is told and the time is freed through the normal path. | Deleting a future booking first cancels it and sends the cancellation |
| R2.5 | Every delete is written to the audit log with who did it. | One audit row per deleted item |
| R2.6 | Only roles with the permission can delete (R9). | A reception user does not see delete |
| R2.7 | Invoices are deletable in every country by default (D6). A client whose country requires keeping invoices can set `invoices.lockAfterDays` to block deleting older ones. | Unset: delete works. Set: older invoices offer a credit note instead |
| R2.8 | Deleting an invoice made by an outside invoice service asks that service to void it where possible, and says when it cannot. | |
| R2.9 | Deleting a paid order does not refund it; refund is its own action. | |

Layer: core pattern, used by modules. Decision needed: whether a deleted
booking is archived for 30 days first (proposed) or deleted at once.

## R3. Advanced statistics

| Id | Requirement | Met when |
|---|---|---|
| R3.1 | Money: expected and received income, average per visit, income by service and by month. | Numbers match the bookings and payments in a seeded test |
| R3.2 | Customers: new against returning, return rate within 60 / 90 days, top customers, customers not seen for a while. | |
| R3.3 | Time: busiest weekday and hour, how full the opening hours were, how far ahead people book. | |
| R3.4 | Losses: no-show and cancellation rate, and how late cancellations come. | |
| R3.5 | Any date range, comparison with the period before, CSV export of each table. | |
| R3.6 | Modules add their own panels (`statsPanels`): accounting, shop, courses. | |

Layer: the basic screen is core; the advanced panels are the
`stats-advanced` module and may be paid (D8).

## R4. Control through MCP

| Id | Requirement | Met when |
|---|---|---|
| R4.1 | The site offers an MCP server so an AI assistant can work with it: bookings, free times, customers, days off, statistics. | An MCP client connects and lists the tools |
| R4.2 | Access by a personal token per staff member, with that person's permissions, revocable, stored hashed. | A revoked token is refused |
| R4.3 | Every MCP action is written to the audit log as `mcp` with the staff member. | |
| R4.4 | Tools call the core's actions; they never run SQL. Modules add their own tools (`mcpTools`). | |
| R4.5 | Read tools first. Write tools (book, move, cancel, day off) only after the owner of the kit agrees the AI rule wording in the design, part 4. | |

Layer: module `mcp`. Decision needed: the AI rule wording.

## R5. More notification channels

| Id | Requirement | Met when |
|---|---|---|
| R5.1 | More channels than WhatsApp, email and owner push, chosen from: SMS as its own channel and fallback, push to customers, Telegram to the owner. | Each chosen channel sends through `Notify` with a fake in tests |
| R5.2 | The owner sets, per message kind, which channels are tried and in what order, the reminder times, and quiet hours. | |
| R5.3 | A daily summary to the owner. | |
| R5.4 | A missing provider hides its channel; nothing fails. | |

Layer: drivers of the platform's `Notify`. Decision needed: which channels
and which providers.

## R6. Behaviour and content improvements

| Id | Requirement | Met when |
|---|---|---|
| R6.1 | Other improvements the client asked for in how the platform behaves and in its content. | **The list is still to come from the client (Sarah).** Each item is then added here as R6.2, R6.3, … and sorted into core, module or that client's repo |

## R7. Payments, accountant, invoices and shop

All four are modules (D3). Each needs `payments`.

### `payments` (D4)

| Id | Requirement | Met when |
|---|---|---|
| R7.1 | The owner records a payment: amount, method (cash, bank transfer, card on the spot, other; the list is a setting), date, note. The staff member who recorded it is kept. | |
| R7.2 | A payment belongs to a booking, an order or just a customer. | |
| R7.3 | Each booking and order shows a payment status: unpaid, partly paid, paid, refunded. The amount due comes from the prices and the owner can change it. | |
| R7.4 | "Mark paid" in one tap on a booking in the calendar and the today page (cash, full amount); "Record payment" for anything else. | |
| R7.5 | Marking a booking done can ask "paid?" (a setting, on by default). | |
| R7.6 | The customer record shows their payments and what they still owe. | |
| R7.7 | A payments screen: every payment in a date range, filtered by method and status; edit; delete one or many (R2). | |
| R7.8 | A refund is recorded as a negative payment with a reason. | |
| R7.9 | Later: online payment through a provider, recorded in the same place, so everything above works the same. Card numbers never touch the site. | Decision needed: the provider |

### `accounting`, the simple accountant (D5)

| Id | Requirement | Met when |
|---|---|---|
| R7.10 | Income is read from the payments; nothing is typed twice. | |
| R7.11 | The owner types expenses: date, amount, category (a list in the settings), supplier, note, optional photo of the receipt. | |
| R7.12 | Screens: a month at a glance (income, expenses, profit); income by service and by method; expenses by category; the year by month; money owed. | |
| R7.13 | Export to CSV for the client's own accountant (and to a Google Sheet when that connector is on). | |
| R7.14 | Everything can be edited and deleted, one or many. | |
| R7.15 | Not included: tax returns, VAT reports, double-entry bookkeeping, payroll. | |

### `invoices`

| Id | Requirement | Met when |
|---|---|---|
| R7.16 | From one or several payments the owner makes a numbered receipt or invoice as a PDF, in the client's languages, with the business details, and sends it to the customer. | |
| R7.17 | Numbering, prefix and wording are settings; tax lines are optional settings (D6). | |
| R7.18 | Deletable, one or many (R2.7, R2.8). | |

### `shop`

| Id | Requirement | Met when |
|---|---|---|
| R7.19 | The site can become a shop: when on, it replaces the WhatsApp order button. | |
| R7.20 | Products get stock, variants and "sold out". | |
| R7.21 | Cart and checkout with name and phone (proven with a code), delivery or pickup; paid in cash on pickup or delivery until online payment exists. | |
| R7.22 | Orders with statuses (new, ready, sent, collected, cancelled); paid or not is `payments`' status. | |
| R7.23 | An orders screen with bulk actions, including delete (R2). | |
| R7.24 | Messages to the customer: received, ready, sent. | |
| R7.25 | Courses: Vered's `courses` extension moves into the kit so every client (Sarah included) can sell courses with dates and seats, paid through `payments`. | |

### Before any of R7

| Id | Requirement | Met when |
|---|---|---|
| R7.0 | Currency, time zone and country are per-client settings (D7), defaulting to ILS, Asia/Jerusalem and Israel. | A test client in another currency and time zone passes the suite |

## R8. Connectors

| Id | Requirement | Met when |
|---|---|---|
| R8.1 | Outgoing webhooks: every booking, payment and order event is posted, signed, to URLs the owner sets (n8n, Zapier, Make), so any other app can be connected. | |
| R8.2 | Google Calendar: each booking appears in the owner's calendar; optionally, busy times in her calendar block online booking. A failed sync never blocks a booking. | |
| R8.3 | Google Sheets: bookings, customers and (with accounting) money kept in a sheet, or exported in one click. | |
| R8.4 | Google Docs / Drive: invoices and orders saved as files in a Drive folder. | |
| R8.5 | Each connector is a module, switched on per client; tokens are stored encrypted. | |
| R8.6 | Further apps that reasonably fit (iCal feed, email-marketing lists, product catalogue for ads) are added the same way when asked. | |

Decision needed: one Google Cloud project for all clients, or one each.

## R9. Admins, users and the paid tier (D8)

| Id | Requirement | Met when |
|---|---|---|
| R9.1 | More than one person can have admin access. The owner invites by email with a role; the person signs in with the existing password and code. | |
| R9.2 | Roles: owner, manager, reception, viewer. Each role has a fixed list of permissions, checked on the server for every page and action (and MCP, and module actions). | A reception user cannot open settings or delete, even by URL |
| R9.3 | Modules declare their own permissions (`permissions` point). | |
| R9.4 | The owner can change a role, sign someone out everywhere, or remove them. | |
| R9.5 | The number of users is limited per client; adding past the limit is refused with "your plan has N seats". The limit cannot be raised from the owner area or the database. | |
| R9.6 | The same mechanism switches paid modules on (for example MCP, connectors, advanced statistics, shop). | |

Decision needed: a signed licence or a plain number in the server's
settings; seats per plan; which modules are paid.

## How clients get all of this

| Id | Requirement | Met when |
|---|---|---|
| R0.1 | Every requirement here is built in the kit and reaches each client project with `pnpm kit update` (D1). | Each stage's commit merges into every client without conflicts |
| R0.2 | Core changes arrive at once; modules arrive switched off, and a client turns one on in its `client.json`. | |
| R0.3 | A module's behaviour is controlled by its spec, `extensions/<id>/SPEC.md`, agreed before it is built (D3). | Each module folder has a SPEC.md with the nine headings of the design |

## Open decisions

Listed with the requirement they block. When one is answered, write it into
the decisions table above with the date, and remove it here.

1. Delete a booking at once, or archive for 30 days first (R2).
2. The AI rule wording for MCP write tools (R4.5).
3. Notification channels and providers (R5).
4. Sarah's list of other improvements (R6).
5. Online payment provider (R7.9), when a client needs it.
6. Google Cloud project: shared or per client (R8).
7. Seat limit: licence or plain number; seats per plan; paid modules (R9).
