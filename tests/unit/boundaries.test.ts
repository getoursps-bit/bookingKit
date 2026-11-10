import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The shape of the code: the core is three modules (booking, website,
// platform) that own the database; pages, routes, the worker and the
// extensions' manifests reach it through their functions.

const ROOT = path.resolve(__dirname, "../..");

function sources(dir: string): string[] {
  const full = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (name === "node_modules" || name === "dist") return [];
    const relative = path.join(dir, name);
    if (statSync(path.join(ROOT, relative)).isDirectory()) return sources(relative);
    return /\.tsx?$/.test(name) ? [relative] : [];
  });
}

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("the core owns the database", () => {
  it("no SQL is run outside the core modules and the extensions' server folders", () => {
    const allowed = (file: string) =>
      file.startsWith("src/core/") ||
      /^extensions\/[^/]+\/server\//.test(file) ||
      // Schema tooling: the migration runner and the seed.
      file === "scripts/migrate.ts" ||
      file.startsWith("db/seed/");
    const sql = /\bquery\s*(<[^>]*>)?\(|\bwithTransaction\(/;
    const offenders = ["src", "worker", "scripts", "extensions", "db/seed"]
      .flatMap(sources)
      .filter((file) => !allowed(file) && sql.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe("the platform is what booking and the website both need", () => {
  // Places where the platform still reaches into booking or the website.
  // The list may only get shorter: a new crossing fails this test.
  const KNOWN: Record<string, string[]> = {
    "src/core/platform/notify/dispatch.ts": [
        "booking/appointments",
        "booking/manageTokens"
    ],
    "src/core/platform/staff/http.ts": [
        "booking/http"
    ]
  };

  it("platform code does not import booking or website code, except the known crossings", () => {
    const crossings: Record<string, string[]> = {};
    for (const file of sources("src/core/platform")) {
      const found = [...read(file).matchAll(/from\s+["']((?:\.\.\/)+(?:booking|website)\/[^"']+|@\/core\/(?:booking|website)\/[^"']+)["']/g)]
        .map((match) => match[1]!.replace(/^(?:\.\.\/)+/, "").replace(/^@\/core\//, ""))
        .sort();
      if (found.length > 0) crossings[file] = [...new Set(found)];
    }
    expect(crossings).toEqual(KNOWN);
  });
});
