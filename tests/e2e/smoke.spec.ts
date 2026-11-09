import { expect, test } from "@playwright/test";

test("home page is Hebrew, right to left, with a working skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "דילוג לתוכן הראשי" })).toBeFocused();
});

test("health check answers", async ({ request }) => {
  const response = await request.get("/healthz");
  expect([200, 503]).toContain(response.status());
});
