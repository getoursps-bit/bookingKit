import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import heFile from "../../languages/he/messages.json" with { type: "json" };
import { searchPathOption } from "../../src/server/db-schema";
import { DEV_DATABASE_URL } from "../setup/dev-db";
import { flatten } from "../../src/i18n/flatten";
import { DEFAULT_LOCALE, LOCALES, PACKS } from "../../src/i18n/languages.generated";
import { MESSAGES } from "../../src/i18n/packs.generated";

const he = flatten(heFile);
// The site's languages after the default one; the switch test uses the first.
const OTHERS = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
const OTHER = OTHERS[0];
const other = OTHER ? flatten(MESSAGES[OTHER]) : null;

// Runs against the local (or CI) database, migrated and seeded. The chat
// number is a fictional test number set for this run and removed afterwards.
const CHAT = "+972555000123";
const PAGES = [
  "/",
  "/services",
  "/products",
  "/gallery",
  "/hours",
  "/contact",
  "/accessibility",
  "/privacy",
  "/book",
  "/l/dog-grooming",
];

const databaseUrl = process.env.DATABASE_URL ?? DEV_DATABASE_URL;

async function setSetting(key: string, value: unknown | null) {
  const client = new pg.Client({ connectionString: databaseUrl, options: searchPathOption() });
  await client.connect();
  try {
    if (value === null) await client.query("delete from settings where key = $1", [key]);
    else
      await client.query(
        "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
        [key, JSON.stringify(value)],
      );
  } finally {
    await client.end();
  }
}

let previousChat: unknown = null;

test.beforeAll(async () => {
  const client = new pg.Client({ connectionString: databaseUrl, options: searchPathOption() });
  await client.connect();
  const { rows } = await client.query("select value from settings where key = 'whatsapp.chatNumber'");
  previousChat = rows[0]?.value ?? null;
  await client.end();
  await setSetting("whatsapp.chatNumber", CHAT);
});

test.afterAll(async () => {
  await setSetting("whatsapp.chatNumber", previousChat);
});

for (const path of [...PAGES, ...OTHERS.flatMap((lang) => PAGES.map((page) => (page === "/" ? `/${lang}` : `/${lang}${page}`)))]) {
  test(`${path} passes an axe check`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("pages render their content", async ({ page }) => {
    await page.goto("/services");
    await expect(page.getByRole("heading", { level: 1, name: "שירותים ומחירים" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "חתול", exact: true })).toBeVisible();
    await page.goto("/hours");
    await expect(page.getByRole("row", { name: /רביעי/ })).toContainText("סגור");
  });
});

test("pages are noindex while the setting is on", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const response = await request.get("/");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/\s*$/m);
});

test("each page gets its own script nonce", async ({ request }) => {
  const first = (await request.get("/")).headers()["content-security-policy"]!;
  const second = (await request.get("/")).headers()["content-security-policy"]!;
  expect(first).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(first).not.toBe(second);
});

test("the WhatsApp order link names the product and its price for the chat number", async ({ page, request }) => {
  await page.goto("/products");
  const link = page.locator('a[href^="/go/order/"]').filter({ hasText: /:\s*מרכך\s/ });
  await expect(link).toHaveText(/^הזמנה בוואטסאפ/);
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/go\/order\/\d+$/);

  const response = await request.get(href!, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const target = new URL(response.headers()["location"]!);
  expect(`${target.origin}${target.pathname}`).toBe("https://wa.me/972555000123");
  const text = target.searchParams.get("text")!;
  expect(text).toContain("מרכך");
  expect(text).toContain("69.90");
  expect(response.headers()["location"]).not.toMatch(/[א-ת]/);
});

test("book links count the click and reach the booking page", async ({ request }) => {
  const response = await request.get("/go/book?species=dog", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(new URL(response.headers()["location"]!).pathname + new URL(response.headers()["location"]!).search).toBe(
    "/book?species=dog",
  );
});

test("book links go to the public address, not the host the server listens on", async ({ request, baseURL }) => {
  // The server listens on 0.0.0.0 (see playwright.config.ts), as in the image behind the proxy.
  const response = await request.get("/go/book?species=cat", { maxRedirects: 0 });
  expect(response.headers()["location"]).toBe(`${baseURL}/book?species=cat`);
});

test("the home page carries valid LocalBusiness JSON-LD", async ({ page }) => {
  await page.goto("/");
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(raw!);
  expect(data["@context"]).toBe("https://schema.org");
  expect(data["@type"]).toBe("LocalBusiness");
  expect(data.name).toBeTruthy();
  expect(data.openingHoursSpecification.length).toBe(5);
});

test("campaign tags from the first visit are kept in a signed cookie", async ({ page, context }) => {
  await page.goto("/l/dog-grooming?utm_source=instagram&utm_campaign=test");
  const cookie = (await context.cookies()).find((entry) => entry.name === "bk_src");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.value).toContain(".");
});

test("unknown landing pages are not found", async ({ request }) => {
  expect((await request.get("/l/no-such-page")).status()).toBe(404);
});

test("the site can be installed as an app", async ({ request, page }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.dir).toBe(PACKS[DEFAULT_LOCALE].dir);
  expect(manifest.lang).toBe(DEFAULT_LOCALE);
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  const worker = await request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/offline")).status()).toBe(200);

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope))
    .toBe(new URL("/", page.url()).href);
});

const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** The floating card appears only once the page's scripts run, so the buttons and the install listener are live. */
const installReady = (page: Page) => expect(page.getByRole("complementary", { name: "התקנה כאפליקציה" })).toBeVisible();

for (const [browserName, userAgent, step] of [
  ["iPhone Safari", IPHONE_SAFARI, "הוספה למסך הבית"],
  ["Mac Safari", MAC_SAFARI, "Add to Dock"],
] as const) {
  test(`${browserName} gets the install button and its steps`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent, locale: "he-IL", viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/");
    await installReady(page);
    await page.locator("main").getByRole("button", { name: "התקנה כאפליקציה" }).click();
    await expect(page.getByRole("dialog", { name: "התקנת האפליקציה" })).toContainText(step);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);
    await context.close();
  });
}

test("the install button opens the browser's own dialog when there is one", async ({ page }) => {
  await page.goto("/");
  await installReady(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => void ((window as unknown as { prompted: boolean }).prompted = true),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await page.locator("main").getByRole("button", { name: "התקנה כאפליקציה" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the install card closes for the visit, the home button stays, and the app itself shows neither", async ({ browser }) => {
  const context = await browser.newContext({ locale: "he-IL" });
  const page = await context.newPage();
  const card = page.getByRole("complementary", { name: "התקנה כאפליקציה" });
  await page.goto("/");
  await card.getByRole("button", { name: "סגירה" }).click();
  await expect(card).toHaveCount(0);
  await page.goto("/products");
  await expect(card).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator("main").getByRole("button", { name: "התקנה כאפליקציה" })).toBeVisible();

  const installed = await context.newPage();
  await installed.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query.includes("standalone") ? ({ ...real(query), matches: true } as MediaQueryList) : real(query);
  });
  await installed.goto("/");
  await expect(installed.getByRole("button", { name: "התקנה כאפליקציה" })).toHaveCount(0);
  await context.close();
});

test("phones get the bottom app bar, wide screens the header links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/services");
  const bottom = page.getByRole("navigation", { name: he["nav.app"], exact: true });
  await expect(bottom).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(bottom).toBeHidden();
  const main = page.getByRole("navigation", { name: he["nav.main"], exact: true });
  await expect(main.locator('a[aria-current="page"]')).toBeVisible();
});

test("the language switch moves between the default language and another and remembers the choice", async ({ page }) => {
  test.skip(!OTHER || !other, "a one-language site");
  const lang = OTHER!;
  const t = other!;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/services");
  await expect(page.locator("html")).toHaveAttribute("dir", PACKS[DEFAULT_LOCALE].dir);
  await page.locator("header").getByRole("link", { name: PACKS[lang].name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/services$`));
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", PACKS[lang].dir);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t["services.title"]);
  // Links on the other language's pages stay in it.
  await page.getByRole("navigation", { name: t["nav.main"], exact: true }).getByRole("link", { name: t["nav.hours"] }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/hours$`));
  // The owner area follows the remembered language.
  await page.goto("/admin/login");
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await page.goto(`/${lang}/hours`);
  await page.locator("header").getByRole("link", { name: PACKS[DEFAULT_LOCALE].name, exact: true }).click();
  await expect(page).toHaveURL(/\/hours$/);
  await expect(page.locator("html")).toHaveAttribute("dir", PACKS[DEFAULT_LOCALE].dir);
});

