import { expect, type Page, test } from "@playwright/test";
import { DEFAULT_LOCALE, LOCALES } from "../../src/i18n/languages.generated";

// A picture of each page, to prove that a change to the brand plumbing leaves
// the default look untouched. Not part of the normal run: pictures differ by
// machine, so they are never committed.
//   VISUAL=1 pnpm test:e2e visual --update-snapshots   takes the pictures
//   VISUAL=1 pnpm test:e2e visual                      compares against them
test.skip(!process.env.VISUAL, "runs only with VISUAL=1");

const PAGES = [
  "/",
  "/services",
  "/products",
  "/gallery",
  "/hours",
  "/contact",
  "/accessibility",
  "/privacy",
  "/offline",
  "/no-such-page",
  "/admin/login",
];

// The site's languages after the default one get the public pages too.
const OTHERS = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

const WIDTHS = { phone: null, wide: { width: 1440, height: 900 } } as const;

/** The parts that change with the clock: free times and today's row in the hours. */
const live = (page: Page) => [
  page.locator("ul[aria-labelledby='free-title']"),
  page.locator("a[href*='/book?']"),
  page.locator("#hours"),
  page.locator("table"),
];

for (const [label, viewport] of Object.entries(WIDTHS)) {
  for (const path of [...PAGES, ...OTHERS.flatMap((lang) => PAGES.slice(0, 9).map((page) => (page === "/" ? `/${lang}` : `/${lang}${page}`)))]) {
    test(`${label} ${path}`, async ({ page }) => {
      if (viewport) await page.setViewportSize(viewport);
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot({
        fullPage: true,
        animations: "disabled",
        mask: live(page),
        maxDiffPixels: 0,
      });
    });
  }
}
