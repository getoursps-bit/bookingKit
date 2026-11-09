import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import argon2 from "argon2";
import { generate, generateSecret } from "otplib";
import pg from "pg";
import sharp from "sharp";
import { searchPathOption } from "../../src/server/db-schema";
import { DEV_DATABASE_URL } from "../setup/dev-db";
import { DEFAULT_LOCALE, LOCALES } from "../../src/i18n/languages.generated";
import { strings } from "./client";

// The site's first language after the default one, if there is one.
const OTHER = LOCALES.find((locale) => locale !== DEFAULT_LOCALE);

// The owner area on a phone: login with password and app code, then every
// admin page. The staff account is made up for the test and removed after.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, locale: "he-IL", hasTouch: true });

const databaseUrl = process.env.DATABASE_URL ?? DEV_DATABASE_URL;
const EMAIL = `e2e-${Date.now()}@example.test`;
// A made-up password for the test account only.
const PASSWORD = "e2e-password-not-real";
const SECRET = generateSecret();

async function sql<Row extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: databaseUrl, options: searchPathOption() });
  await client.connect();
  try {
    return (await client.query<Row>(text, params)).rows;
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  await sql("insert into staff (email, password_hash, totp_secret) values ($1, $2, $3)", [
    EMAIL,
    await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    SECRET,
  ]);
});

// Repeated local runs would otherwise reach the per-address login limit.
test.beforeEach(async () => {
  await sql("delete from rate_limits where key like 'login:%'");
});

test.afterAll(async () => {
  await sql("delete from staff where email = $1", [EMAIL]);
  await sql("delete from fake_messages where recipient = $1", [EMAIL]);
});

async function login(page: Page) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form[action="/api/admin/auth"] button[type="submit"]').click();
  const code = page.locator('input[name="code"]');
  await expect(code).toBeVisible();
  // Wait for a fresh time step, so this code was not used by an earlier test.
  const step = Math.floor(Date.now() / 30_000);
  await sql("update staff set totp_last_step = $2 where email = $1", [EMAIL, step - 1]);
  await code.fill(await generate({ secret: SECRET }));
  await page.locator('form[action="/api/admin/auth"] button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function noSideScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (wide) {
    const info = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return [
        location.pathname,
        ...[...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > w + 1 || r.left < -1;
          })
          .slice(0, 8)
          .map(
            (el) =>
              `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`,
          ),
      ];
    });
    console.log("WIDE", JSON.stringify(info, null, 1));
  }
  expect(wide).toBe(false);
}

test("admin pages need a login", async ({ page }) => {
  for (const path of ["/admin", "/admin/calendar", "/admin/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
  const feed = await page.request.get("/api/admin/bookings?start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z");
  expect(feed.status()).toBe(401);
});

test("a wrong app code does not log in", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form[action="/api/admin/auth"] button[type="submit"]').click();
  await page.locator('input[name="code"]').fill("000000");
  await page.locator('form[action="/api/admin/auth"] button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("the owner can log in with a code sent to her email instead", async ({ page }) => {
  await page.goto("/lang/he?back=/admin/login");
  await page.getByRole("link", { name: "כניסה עם קוד באימייל" }).click();
  await expect(page).toHaveURL(/step=email/);
  await page.locator('input[name="email"]').fill(EMAIL.toUpperCase());
  await page.locator('form[action="/api/admin/auth"] button[type="submit"]').click();
  await expect(page).toHaveURL(/step=emailcode/);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  const [message] = await sql<{ body: string }>(
    "select body from fake_messages where recipient = $1 and template_key = 'staff_code' order by id desc limit 1",
    [EMAIL],
  );
  const code = /(\d{6})/.exec(message?.body ?? "")?.[1] ?? "";
  await page.locator('input[name="code"]').fill(code);
  await page.locator('form[action="/api/admin/auth"] button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("the owner logs in and every admin page works on a phone", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { level: 1, name: "היום" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  for (const [path, heading] of [
    ["/admin/calendar", "יומן"],
    ["/admin/inbox", "הודעות"],
    ["/admin/customers", "לקוחות"],
    ["/admin/catalog", "תוכן"],
    ["/admin/hours", "שעות"],
    ["/admin/settings", "הגדרות"],
    ["/admin/stats", "נתונים"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await noSideScroll(page);
  }
});

test("the calendar shows the day in Hebrew, right to left", async ({ page }) => {
  await login(page);
  await page.goto("/admin/calendar");
  const calendar = page.locator(".admin-calendar");
  await expect(calendar).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // The day's title comes from the calendar once it has rendered.
  await expect(page.locator(".cal-title")).toHaveText(/\d/);
  await expect(page.getByRole("button", { name: "יום", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "שבוע", exact: true }).click();
  await expect(page.getByRole("button", { name: "שבוע", exact: true })).toHaveAttribute("aria-pressed", "true");
  // The month shows whole weeks; a click on a day opens that day.
  await page.getByRole("button", { name: "חודש", exact: true }).click();
  await expect(page.getByRole("button", { name: "חודש", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cal-day").first()).toBeVisible();
  await page.locator(".cal-day").nth(10).click();
  await expect(page.getByRole("button", { name: "יום", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("each admin page renews the session cookie for another 30 days", async ({ page }) => {
  await login(page);
  const response = await page.goto("/admin/calendar");
  const cookies = (await response!.headersArray()).filter((header) => header.name.toLowerCase() === "set-cookie");
  const session = cookies.find((header) => header.value.startsWith("bk_admin="));
  expect(session?.value).toMatch(/Max-Age=2592000/i);
});

test("a settings change is saved and shown again", async ({ page }) => {
  await login(page);
  await page.goto("/admin/settings");
  const field = page.locator('input[name="booking.holdMin"]');
  const before = await field.inputValue();
  await field.fill("12");
  await field.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  await expect(page.getByRole("status")).toContainText("ההגדרות נשמרו");
  await expect(page.locator('input[name="booking.holdMin"]')).toHaveValue("12");
  await sql("delete from settings where key = 'booking.holdMin'");
  expect(before).toBe("10");
});

test("the stats screen shows the period's numbers in both languages and passes axe", async ({ page }) => {
  await login(page);
  await page.goto("/admin/stats?days=7");
  await expect(page.getByRole("heading", { level: 1, name: "נתונים" })).toBeVisible();
  await expect(page.getByRole("link", { name: /7\W*ימים/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("תורים שנקבעו", { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  await noSideScroll(page);

  if (OTHER) {
    const t = strings(OTHER);
    await page.goto(`/lang/${OTHER}?back=/admin/stats?days=90`);
    await expect(page.getByRole("heading", { level: 1, name: t["stats.title"] })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(t["stats.days"].replace("{n}", "90").replace(/\s+/g, "\\W*")) })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: t["stats.weekly"] })).toBeVisible();
    const axeOther = await new AxeBuilder({ page }).analyze();
    expect(axeOther.violations.map((violation) => violation.id)).toEqual([]);
    await page.goto(`/lang/${DEFAULT_LOCALE}?back=/admin`);
  }
});

const photo = async (name: string, background: string) => ({
  name,
  mimeType: "image/png",
  buffer: await sharp({ create: { width: 64, height: 64, channels: 3, background } }).png().toBuffer(),
});

test("the owner uploads several gallery photos with no text, and text stays optional", async ({ page }) => {
  const alt = `e2e gallery ${Date.now()}`;
  const upload = page.locator('form[action="/api/admin/gallery"] button[type="submit"]');
  const [{ last }] = (await sql<{ last: string }>("select coalesce(max(id), 0) as last from gallery_images")) as [{ last: string }];
  const added = () =>
    sql<{ alt_he: string; alt_en: string | null }>(
      `select g.alt_he, (select t.value from content_translations t
         where t.entity = 'gallery_image' and t.entity_key = g.id::text and t.field = 'alt' and t.locale = $2) as alt_en
       from gallery_images g where g.id > $1 order by g.id`,
      [last, OTHER ?? ""],
    );
  await login(page);
  await page.goto("/admin/catalog#gallery");
  await expect(page.getByText("הסכמה")).toHaveCount(0);
  try {
    await expect(page.locator('input[name="alt"]')).toBeHidden();
    const file = page.locator('input[name="file"]');
    await expect(file).toHaveAttribute("multiple", "");
    await file.setInputFiles([await photo("a.png", "#a86"), await photo("b.png", "#68a"), await photo("c.png", "#6a8")]);
    await upload.click();
    await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
    await expect(page.getByAltText(strings("he")["gallery.defaultAlt"]!)).not.toHaveCount(0);
    expect(await added()).toHaveLength(3);
    // The standard description in the default language, and in the other language when the site has one.
    expect((await added())[0]).toEqual({ alt_he: strings("he")["gallery.defaultAlt"], alt_en: OTHER ? strings(OTHER)["gallery.defaultAlt"] : null });
    await noSideScroll(page);

    // With the box ticked the text is kept; one bad file is named and the good one stays.
    await page.getByLabel("הוספת תיאור וכיתוב").check();
    await page.locator('input[name="alt"]').fill(alt);
    await page.locator('input[name="file"]').setInputFiles([
      await photo("good.png", "#86a"),
      { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    ]);
    await upload.click();
    await expect(page.getByRole("alert").filter({ hasText: "bad.png" })).toBeVisible();
    await expect(page.getByAltText(alt)).toHaveCount(1);

    await page.goto("/gallery");
    await expect(page.getByAltText(alt)).toHaveCount(1);
  } finally {
    await sql("delete from gallery_images where id > $1", [last]);
  }
});

test("the owner sets the home page cover photo and removes it", async ({ page }) => {
  const cover = () => page.locator("section[aria-labelledby='hero-title'] img[src*='/site/']");
  const form = page.locator('form:has(input[name="action"][value="profile"])');
  await login(page);
  try {
    await page.goto("/admin/catalog#profile");
    await form.locator('input[name="photo"]').setInputFiles(await photo("cover.png", "#a86"));
    await form.locator('button[type="submit"]').click();
    await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
    await page.goto("/");
    await expect(cover()).toHaveCount(1);

    await page.goto("/admin/catalog#profile");
    await form.getByLabel("הסרת התמונה").check();
    await form.locator('button[type="submit"]').click();
    await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
    await page.goto("/");
    await expect(cover()).toHaveCount(0);
  } finally {
    await sql("update business_profile set cover_key = null");
  }
});

test("the owner adds, replaces and removes a product photo", async ({ page }) => {
  const name = `e2e product ${Date.now()}`;
  const imageKey = async () => (await sql<{ image_key: string | null }>("select image_key from products where name_he = $1", [name]))[0]?.image_key;
  await login(page);
  await page.goto("/admin/catalog#products");
  const added = page.locator("#products").locator("xpath=ancestor::section").locator("details").last();
  await added.locator("summary").click();
  await added.locator('input[name="name"]').fill(name);
  await added.locator('input[name="price"]').fill("20");
  await added.locator('input[name="photo"]').setInputFiles(await photo("p.png", "#a86"));
  await added.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
  try {
    const first = await imageKey();
    expect(first).toMatch(/^products\/.+\.webp$/);

    const item = page.locator("details").filter({ hasText: name });
    await item.locator("summary").click();
    await item.locator('input[name="photo"]').setInputFiles(await photo("q.png", "#68a"));
    await item.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
    const second = await imageKey();
    expect(second).toMatch(/^products\//);
    expect(second).not.toBe(first);

    // Saving other fields keeps the photo.
    await item.locator("summary").click();
    await item.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
    expect(await imageKey()).toBe(second);

    await item.locator("summary").click();
    await item.getByLabel("הסרת התמונה").check();
    await item.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
    expect(await imageKey()).toBeNull();
  } finally {
    await sql("delete from products where name_he = $1", [name]);
  }
});
