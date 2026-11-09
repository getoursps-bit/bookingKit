// The Postgres schema that holds the app's tables. Each client has its own
// database or schema, so the name is a setting, not the client's name. Read
// straight from the environment because the migrate and seed scripts run
// without the app's full configuration.

/** The schema name from DB_SCHEMA, "app" when not set. */
export function dbSchema(): string {
  const schema = process.env.DB_SCHEMA || "app";
  // It is placed into the connection options as text, so only a plain name is allowed.
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("DB_SCHEMA must be a plain lower-case name");
  return schema;
}

/** Connection options that make every query run inside the app's own schema. */
export function searchPathOption(): string {
  return `-c search_path=${dbSchema()}`;
}
