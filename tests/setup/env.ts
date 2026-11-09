import { DEV_ADMIN_DATABASE_URL, DEV_DATABASE_URL } from "./dev-db";

// Test defaults: fake providers and the local compose database, unless CI or
// the developer already set them.
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "test-only-secret-test-only-secret-00";
process.env.PROVIDERS ??= "fake";
process.env.DATABASE_URL ??= DEV_DATABASE_URL;
process.env.TEST_ADMIN_DATABASE_URL ??= DEV_ADMIN_DATABASE_URL;
process.env.LOG_LEVEL ??= "warn";
