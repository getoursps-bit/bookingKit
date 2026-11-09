// The local compose database (docker/compose.dev.yml and docker/dev-init):
// the app's restricted role, and the superuser that tests use to make
// throwaway schemas. Local values only; nothing here exists on a server.
export const DEV_DATABASE_URL = "postgres://app_user:app-dev@localhost:5435/postgres";
export const DEV_ADMIN_DATABASE_URL = "postgres://postgres:postgres@localhost:5435/postgres";
