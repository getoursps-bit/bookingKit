import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import en from "../../src/i18n/en.json" with { type: "json" };

// The booking flow end to end, on a phone-size screen with fake providers and
// the seeded database. Every customer here uses a random number from the
// fictional 0555 range and is removed afterwards.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, locale: "he-IL", hasTouch: true });

const databaseUrl = process.env.DATABASE_URL ?? "postgres://fluffyfur_app:fluffyfur-dev@localhost:5435/postgres";
const TEST_PREFIX = "+9725559";

async function sql<Row extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: databaseUrl, options: "-c search_path=fluffyfur" });
  await client.connect();
  try {
    return (await client.query<Row>(text, params)).rows;
  } finally {
    await client.end();
  }
}

async function setSetting(key: string, value: unknown | null) {
  if (value === null) await sql("delete from settings where key = $1", [key]);
  else
    await sql(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
      [key, JSON.stringify(value)],
    );
}

/** A fresh fictional customer: local number as typed, its E.164 form, and its own client address. */
function customer() {
  const tail = String(Math.floor(Math.random() * 100_000)).padStart(5, "0");
  return {
    local: `055-59${tail}`,
    e164: `${TEST_PREFIX}${tail}`,
    address: `198.51.100.${Math.floor(Math.random() * 250) + 1}-${tail}`,
  };
}

async function latestMessage(recipient: string, templateKey: string) {
  await expect
    .poll(
      async () =>
        (await sql("select 1 from fake_messages where recipient = $1 and template_key = $2", [recipient, templateKey]))
          .length,
    )
    .toBeGreaterThan(0);
  const [row] = await sql<{ body: string; channel: string }>(
    "select body, channel from fake_messages where recipient = $1 and template_key = $2 order by id desc limit 1",
    [recipient, templateKey],
  );
  return row!;
}

async function codeFor(recipient: string): Promise<string> {
  const { body } = await latestMessage(recipient, "code");
  return /(\d{6})/.exec(body)![1]!;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

async function newCustomerPage(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "he-IL",
    extraHTTPHeaders: { "x-forwarded-for": address },
  });
  return context.newPage();
}

const SMALL_DOG = "כלב - גזע קטן עד 10 קילו";
const CAT = "חתול";

/** The button that chooses a service. */
function serviceButton(page: Page, service: string, label = "בחירה") {
  return page.getByRole("button", { name: new RegExp(`^${label}\\s*: ${service}$`) });
}

/** Chooses the service with the keyboard; one pet per booking, so the time step follows with it shown. */
async function chooseService(page: Page, service: string) {
  await serviceButton(page, service).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/step=time/);
  await expect(page.getByText(service, { exact: true })).toBeVisible();
}

/** Fills one pet's details on the details step with the keyboard: name, vet, and the vaccination certificate box. */
async function fillPet(page: Page, index: number, name: string) {
  await page.locator(`#pet-${index}-name`).focus();
  await page.keyboard.type(name);
  await page.locator(`#pet-${index}-vet`).focus();
  await page.keyboard.type("מרפאת בדיקה");
  await page.locator(`#pet-${index}-vaccines`).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(`#pet-${index}-vaccines`)).toBeChecked();
}

async function pressButton(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).first().focus();
  await page.keyboard.press("Enter");
}

/** Service → time → details, ending on the code step (or wherever the hold sends us). */
async function reachCode(page: Page, who: ReturnType<typeof customer>, opts: { email?: string; slot?: string } = {}) {
  await page.goto("/book");
  await chooseService(page, SMALL_DOG);
  if (opts.slot) {
    await page.getByRole("button", { name: opts.slot }).first().focus();
    await page.keyboard.press("Enter");
  } else {
    await pressButton(page, "לקחת את המועד הזה");
  }
  await expect(page).toHaveURL(/step=contact/);
  await fillPet(page, 0, "רקס");
  await page.getByLabel("שם מלא").fill("לקוח בדיקה");
  await page.getByLabel("טלפון נייד").fill(who.local);
  if (opts.email) await page.getByLabel("מייל (לא חובה)").fill(opts.email);
  // The form must have been open for a few seconds (bot check).
  await page.waitForTimeout(3_200);
  await pressButton(page, "שליחת קוד אימות");
}

test.afterAll(async () => {
  await sql(`delete from appointments where customer_id in (select id from customers where phone_e164 like $1)`, [
    `${TEST_PREFIX}%`,
  ]);
  await sql("delete from customers where phone_e164 like $1", [`${TEST_PREFIX}%`]);
  await sql("delete from fake_messages where recipient like $1 or recipient like '%@example.com'", [`${TEST_PREFIX}%`]);
});

test("a new customer books a dog with the keyboard, then moves and cancels from the private link", async ({
  browser,
}) => {
  const who = customer();
  const page = await newCustomerPage(browser, who.address);

  await page.goto("/book");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await axe(page);
  await chooseService(page, SMALL_DOG);
  await expect(page.getByText(/משך התור/)).toBeVisible();
  await axe(page);
  await pressButton(page, "לקחת את המועד הזה");

  await expect(page).toHaveURL(/step=contact/);
  await axe(page);
  // The pets' details come last, just before the code.
  await fillPet(page, 0, "רקס");
  await page.getByLabel("שם מלא").focus();
  await page.keyboard.type("לקוח בדיקה");
  await page.keyboard.press("Tab");
  await page.keyboard.type(who.local);
  await page.waitForTimeout(3_200);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/step=code/);
  // The step names where the code went: WhatsApp, to the number's last four digits.
  await expect(page.getByText(/בוואטסאפ למספר שמסתיים ב/)).toContainText(who.e164.slice(-4));
  await axe(page);
  await page.getByLabel("קוד אימות").focus();
  await page.keyboard.type(await codeFor(who.e164));
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/b\/[\w-]+\?new=1/);
  await expect(page.getByText("התור נקבע!")).toContainText(who.e164.slice(-4));
  await expect(page.getByText("רקס", { exact: false })).toBeVisible();
  await axe(page);

  // The confirmation and the reminder wait in the outbox for the worker.
  const queued = await sql<{ kind: string }>(
    `select o.kind from message_outbox o join appointments a on a.id = o.appointment_id
     join customers c on c.id = a.customer_id where c.phone_e164 = $1 order by o.id`,
    [who.e164],
  );
  expect(queued.map((row) => row.kind)).toEqual(expect.arrayContaining(["code", "confirmation", "owner_alert"]));
  // Nothing in the outbox holds the private link.
  const token = new URL(page.url()).pathname.split("/").pop()!;
  expect(JSON.stringify(await sql("select data from message_outbox"))).not.toContain(token);

  // The first free time can be inside the change cutoff (12 hours) when the
  // tests run in the morning; changes are tested here, the cutoff below.
  await setSetting("booking.cutoffHours", 0);
  try {
    await page.reload();

    // Move: open the picker, take another free time.
    const before = await page.locator("dd time").getAttribute("datetime");
    await page.getByRole("link", { name: "העברת התור" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "בחירת מועד חדש" })).toBeVisible();
    await axe(page);
    // The picker also lists the booking's own time (a move may overlap the old
    // slot); late in the day it can be the last or the only one, so skip it and,
    // if nothing else is left that day, open another open day.
    const otherTime = async () =>
      (
        await page
          .locator("#slots-title + form button")
          .evaluateAll((buttons) => buttons.map((button) => (button as HTMLButtonElement).value))
      )
        .filter((value) => new Date(value).getTime() !== new Date(before!).getTime())
        .pop();
    let other = await otherTime();
    if (!other) {
      await page.locator('a.day[data-status="available"]:not([aria-current])').first().click();
      // The day loads in place; wait for its times to replace the old ones.
      await expect.poll(otherTime).toBeDefined();
      other = await otherTime();
    }
    expect(other).toBeDefined();
    await page.locator(`#slots-title + form button[value="${other}"]`).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("התור הועבר למועד החדש.")).toBeVisible();
    expect(await page.locator("dd time").getAttribute("datetime")).not.toBe(before);

    // Cancel: the disclosure, then the confirm button.
    await page.getByText("ביטול התור", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await pressButton(page, "כן, לבטל את התור");
    await expect(page).toHaveURL(/cancelled=1/);
    await expect(page.getByText("התור בוטל.")).toBeVisible();

    // The link no longer works.
    await page.goto(`/b/${token}`);
    await expect(page.getByRole("heading", { name: "הקישור לא בתוקף" })).toBeVisible();
  } finally {
    await setSetting("booking.cutoffHours", null);
  }
  await page.context().close();
});

test("after the cutoff the private link offers only a call", async ({ browser }) => {
  const who = customer();
  const page = await newCustomerPage(browser, who.address);
  await reachCode(page, who);
  await page.getByLabel("קוד אימות").fill(await codeFor(who.e164));
  await pressButton(page, "אישור התור");
  await expect(page).toHaveURL(/\/b\//);
  await setSetting("booking.cutoffHours", 168);
  try {
    await page.reload();
    await expect(page.getByRole("link", { name: "העברת התור" })).toHaveCount(0);
    await expect(page.getByText("ביטול התור", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/שינוי או ביטול באתר אפשריים עד/)).toBeVisible();
  } finally {
    await setSetting("booking.cutoffHours", null);
  }
  await page.context().close();
});

test("the code can be sent by email instead after 30 seconds", async ({ browser }) => {
  const who = customer();
  const email = `e2e-${Date.now()}@example.com`;
  const page = await newCustomerPage(browser, who.address);
  await page.clock.install();
  await reachCode(page, who, { email });
  await expect(page).toHaveURL(/step=code/);
  await expect(page.getByRole("button", { name: "שליחה במייל" })).toHaveCount(0);
  await page.clock.runFor(31_000);
  await pressButton(page, "שליחה במייל");
  await expect(page).toHaveURL(/sent=email/);
  await expect(page.getByText(/שלחנו קוד בן 6 ספרות אל/)).toContainText("e***@example.com");
  const message = await latestMessage(email, "code");
  expect(message.channel).toBe("email");
  await page.getByLabel("קוד אימות").fill(/(\d{6})/.exec(message.body)![1]!);
  await pressButton(page, "אישור התור");
  await expect(page.getByText("התור נקבע!")).toBeVisible();
  await page.context().close();
});

test("a landing page link for cats lists the cat services first", async ({ browser }) => {
  const page = await newCustomerPage(browser, "10.9.0.42");
  await page.goto("/go/book?species=cat");
  await expect(page).toHaveURL(/\/book\?species=cat/);
  await expect(serviceButton(page, CAT, "בחירה")).toBeVisible();
  await expect(serviceButton(page, SMALL_DOG, "בחירה")).toHaveCount(0);
  await page.getByRole("link", { name: "כל השירותים" }).click();
  await expect(serviceButton(page, SMALL_DOG, "בחירה")).toBeVisible();
  await page.context().close();
});

test("a service chosen on the site goes straight to the time, and its details are asked last", async ({ browser }) => {
  const page = await newCustomerPage(browser, "10.9.0.43");
  await page.goto("/services");
  await page
    .getByRole("link", { name: new RegExp(SMALL_DOG) })
    .first()
    .click();
  // One pet per booking: the time step, with the chosen service shown and a way to change it.
  await expect(page).toHaveURL(/step=time/);
  await expect(page.getByText("השירות שבחרתם")).toBeVisible();
  await expect(page.getByText(SMALL_DOG, { exact: true })).toBeVisible();
  await axe(page);
  await page.getByRole("link", { name: "שינוי" }).click();
  await expect(page).toHaveURL(/step=service/);
  // No list of chosen services and no "another pet" choice.
  await expect(page.getByRole("heading", { name: "השירותים שבחרתם" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /עוד חיה/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^הוספה/ })).toHaveCount(0);
  await chooseService(page, SMALL_DOG);
  await pressButton(page, "לקחת את המועד הזה");
  await expect(page).toHaveURL(/step=contact/);
  await expect(page.locator("#pet-0-vet")).toHaveAttribute("required", "");
  // The vaccination certificate is a yes or no, not a condition for booking.
  await expect(page.locator("#pet-0-vaccines")).not.toHaveAttribute("required", "");
  // A service for dogs only does not ask dog or cat.
  await expect(page.getByRole("radio", { name: "כלב" })).toHaveCount(0);
  await page.context().close();
});

test("without an email given, the code step asks for one and sends the code there", async ({ browser }) => {
  const who = customer();
  const email = `e2e-late-${Date.now()}@example.com`;
  const page = await newCustomerPage(browser, who.address);
  await page.clock.install();
  await reachCode(page, who);
  await expect(page).toHaveURL(/step=code/);
  await page.clock.runFor(31_000);
  await page.getByLabel("המייל שלכם, לקבלת הקוד").fill(email);
  await pressButton(page, "שליחה במייל");
  await expect(page).toHaveURL(/sent=email/);
  const message = await latestMessage(email, "code");
  expect(message.channel).toBe("email");
  await page.getByLabel("קוד אימות").fill(/(\d{6})/.exec(message.body)![1]!);
  await pressButton(page, "אישור התור");
  await expect(page.getByText("התור נקבע!")).toBeVisible();
  await page.context().close();
});

test("two customers race for one slot and one of them is told it was taken", async ({ browser }) => {
  const [a, b] = [customer(), customer()];
  const pageA = await newCustomerPage(browser, a.address);
  const pageB = await newCustomerPage(browser, b.address);

  // Both reach the contact step with the same time: the first free one.
  for (const [page, who] of [
    [pageA, a],
    [pageB, b],
  ] as const) {
    await page.goto("/book");
    await chooseService(page, SMALL_DOG);
    await page.getByRole("button", { name: "לקחת את המועד הזה" }).click();
    await expect(page).toHaveURL(/step=contact/);
    await fillPet(page, 0, "רקס");
    await page.getByLabel("שם מלא").fill("לקוח מרוץ");
    await page.getByLabel("טלפון נייד").fill(who.local);
  }
  await pageA.waitForTimeout(3_200);
  await Promise.all([pressButton(pageA, "שליחת קוד אימות"), pressButton(pageB, "שליחת קוד אימות")]);
  await Promise.all([pageA.waitForURL(/step=(code|time)/), pageB.waitForURL(/step=(code|time)/)]);

  const urls = [pageA.url(), pageB.url()];
  expect(urls.filter((url) => url.includes("step=code"))).toHaveLength(1);
  const lost = urls.find((url) => url.includes("step=time"))!;
  expect(lost).toMatch(/error=(SlotTaken|SlotUnavailable)/);
  await pageA.context().close();
  await pageB.context().close();
});

test("the booking page falls back to the phone when no code can be sent", async ({ browser }) => {
  const who = customer();
  await setSetting("cap.messagesMonthly", 0);
  const page = await newCustomerPage(browser, who.address);
  try {
    await reachCode(page, who);
    await expect(page).toHaveURL(/error=codeNoChannel/);
    await expect(page.getByText(/לא הצלחנו לשלוח קוד כרגע/)).toBeVisible();
    await expect(page.getByLabel("קוד אימות")).toHaveCount(0);
  } finally {
    await setSetting("cap.messagesMonthly", null);
  }
  await page.context().close();
});

test("with photo analysis on, a pet photo can be added and the suggestion corrected", async ({ browser }) => {
  const who = customer();
  const page = await newCustomerPage(browser, who.address);
  await reachCode(page, who);
  await page.getByLabel("קוד אימות").fill(await codeFor(who.e164));
  await pressButton(page, "אישור התור");
  await expect(page).toHaveURL(/\/b\//);
  await expect(page.getByRole("heading", { name: "תמונה של החיה (לא חובה)" })).toHaveCount(0);

  await setSetting("ai.photo", true);
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "תמונה של החיה (לא חובה)" })).toBeVisible();
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#a86" } })
      .png()
      .toBuffer();
    await page.getByLabel("בחירת תמונה").setInputFiles({ name: "rex.png", mimeType: "image/png", buffer: png });
    await pressButton(page, "שליחת התמונה");
    await expect(page.getByRole("status")).toContainText("התמונה התקבלה");
    await expect(page.getByText("התמונה התקבלה, ההצעות בדרך.")).toBeVisible();

    // The worker is not part of this test; stand in for the finished analysis.
    await sql(
      `update ai_jobs set status = 'done', result = $2
       where kind = 'photo' and appointment_id in (select id from appointments where customer_id =
         (select id from customers where phone_e164 = $1))`,
      [who.e164, JSON.stringify({ species: "dog", breed: "פודל מעורב", coat: "תלתלי", condition: "tangled" })],
    );
    await page.reload();
    await expect(page.getByLabel("גזע")).toHaveValue("פודל מעורב");
    await expect(page.getByText("המחיר הסופי נקבע במספרה.")).toBeVisible();
    await page.getByLabel("מצב הפרווה").selectOption("matted");
    await axe(page);
    await pressButton(page, "שמירה");
    await expect(page.getByText(/מצב פרווה שמור: קשרים/)).toBeVisible();
  } finally {
    await setSetting("ai.photo", null);
  }
  await page.context().close();
});

test("an English visitor books in English and gets the code and messages in English", async ({ browser }) => {
  const who = customer();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-GB",
    extraHTTPHeaders: { "x-forwarded-for": who.address },
  });
  const page = await context.newPage();

  await page.goto("/en/book");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await axe(page);
  const service = "Dog - small breed, up to 10 kg";
  await serviceButton(page, service, en["home.choose"]).click();

  // Every step stays under /en, form posts included.
  await expect(page).toHaveURL(/\/en\/book\?.*step=time/);
  await expect(page.getByText(service, { exact: true })).toBeVisible();
  await axe(page);
  await pressButton(page, en["time.takeFirst"]);
  await expect(page).toHaveURL(/\/en\/book\?.*step=contact/);
  await page.getByLabel(en["pets.name"]).fill("Rex");
  await page.getByLabel(en["details.vet"]).fill("Test Clinic");
  await page.getByLabel(en["details.vaccines"]).check();
  await page.getByLabel(en["contact.name"]).fill("Test Customer");
  await page.getByLabel(en["contact.phone"]).fill(who.local);
  await page.waitForTimeout(3_200);
  await pressButton(page, en["contact.submit"]);

  await expect(page).toHaveURL(/\/en\/book\?.*step=code/);
  await expect(page.getByText(/on WhatsApp to the number ending/)).toContainText(who.e164.slice(-4));
  const { body } = await latestMessage(who.e164, "code");
  expect(body).toContain("verification code");
  await page.getByLabel(en["code.label"]).fill(/(\d{6})/.exec(body)![1]!);
  await page.getByLabel(en["code.label"]).press("Enter");

  await expect(page).toHaveURL(/\/en\/b\/[\w-]+\?new=1/);
  await expect(page.getByText(/You're booked! The confirmation is on its way on WhatsApp/)).toContainText(
    who.e164.slice(-4),
  );
  await axe(page);

  // The customer's language is saved, so the worker sends the confirmation and reminder in English.
  const [saved] = await sql<{ locale: string }>("select locale from customers where phone_e164 = $1", [who.e164]);
  expect(saved?.locale).toBe("en");
  await context.close();
});

test("a phone with a verified email: the code goes there, and the new email replaces it after the code", async ({
  browser,
}) => {
  const who = customer();
  const oldEmail = `old-${Date.now()}@example.com`;
  const newEmail = `new-${Date.now()}@example.com`;

  // An earlier booking proved the old email.
  const first = await newCustomerPage(browser, who.address);
  await reachCode(first, who, { email: oldEmail });
  await first.getByLabel("קוד אימות").fill(await codeFor(who.e164));
  await pressButton(first, "אישור התור");
  await expect(first.getByText("התור נקבע!")).toBeVisible();
  await sql("update customer_contacts set verified_at = now() where value = $1", [oldEmail]);
  await first.context().close();

  // A new browser, the same phone, another email.
  const page = await newCustomerPage(browser, `${who.address}9`);
  await reachCode(page, who, { email: newEmail });
  await expect(page).toHaveURL(/step=code/);
  await expect(page.getByText(/כבר רשום המייל/)).toContainText("o***@example.com");
  const replace = page.getByRole("checkbox", { name: /להחליף אותו במייל החדש/ });
  await expect(replace).toBeChecked();
  await axe(page);
  await page.getByLabel("קוד אימות").fill(await codeFor(who.e164));
  await pressButton(page, "אישור התור");
  await expect(page.getByText("התור נקבע!")).toBeVisible();
  const emails = await sql<{ value: string }>(
    "select value from customer_contacts where kind = 'email' and customer_id = (select id from customers where phone_e164 = $1)",
    [who.e164],
  );
  expect(emails.map((row) => row.value)).toEqual([newEmail]);
  await page.context().close();
});

test("the home page's first free time opens the booking with that time offered", async ({ browser }) => {
  const page = await newCustomerPage(browser, "10.9.0.41");
  await page.goto("/");
  const free = page.getByRole("link", { name: /התור הפנוי הקרוב:/ });
  const label = (await free.innerText()).trim();
  await free.click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByText(/בחרתם את/)).toBeVisible();
  // The home page works the time out for one small adult dog.
  await chooseService(page, SMALL_DOG);
  await expect(page.getByText(/השעה שבחרתם:/)).toBeVisible();
  // The offered time is the one the home page showed.
  const time = /\d{2}:\d{2}/.exec(label)![0];
  await expect(page.getByText(/השעה שבחרתם:/)).toContainText(time);
  await pressButton(page, "לקחת את המועד הזה");
  await expect(page).toHaveURL(/step=contact/);
  await page.context().close();
});
