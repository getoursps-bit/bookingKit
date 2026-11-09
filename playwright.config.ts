import { defineConfig, devices } from "@playwright/test";

// A port of its own, so a dev server or other container on 3000 is never
// mistaken for the app under test.
const port = Number(process.env.E2E_PORT ?? 3600);

// End-to-end tests run on a phone-sized screen in Hebrew, because most
// visitors arrive from Instagram on a phone.
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    ...devices["Pixel 7"],
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    // A production build: the dev server recompiles and reloads pages mid-test,
    // and only production shows the real security policy.
    // Bound to 0.0.0.0 like the image (HOSTNAME=0.0.0.0), so request URLs carry
    // the container-style host that production sees behind the proxy.
    command: `./node_modules/.bin/next build && ./node_modules/.bin/next start --hostname 0.0.0.0 --port ${port}`,
    timeout: 300_000,
    url: `http://localhost:${port}/healthz`,
    // The health check may answer 503 when no database runs; the server is still up.
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    env: {
      APP_BASE_URL: `http://localhost:${port}`,
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-only-secret-e2e-only-secret-000",
      PROVIDERS: "fake",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://fluffyfur_app:fluffyfur-dev@localhost:5435/postgres",
    },
  },
});
