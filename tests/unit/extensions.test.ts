import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extensionIds } from "../../scripts/lang-contract";
import { readClient } from "../../scripts/apply-client";
import { migrate, pendingMigrations } from "../../scripts/migrate";
import { testDbAvailable, withTestSchema } from "../setup/db";
import { extensions, hasExtension } from "@/extension/registry";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("extensions", () => {
  it("are the ones client.json lists, in its order", () => {
    expect(extensions().map((extension) => extension.id)).toEqual(readClient().extensions);
    for (const id of readClient().extensions) expect(hasExtension(id)).toBe(true);
    expect(hasExtension("no-such-extension")).toBe(false);
  });

  it("each have a manifest whose id is its folder", async () => {
    for (const id of extensionIds()) {
      const file = path.join(ROOT, "extensions", id, "extension.ts");
      expect(existsSync(file), file).toBe(true);
      const manifest = (await import(file)) as { default: { id: string; requires?: string[] } };
      expect(manifest.default.id).toBe(id);
      for (const needed of manifest.default.requires ?? []) expect(extensionIds()).toContain(needed);
    }
  });
});

describe.skipIf(!(await testDbAvailable()))("extension migrations", () => {
  it("run after the core's and are recorded under the extension's name", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "kit-migrations-"));
    const core = path.join(root, "core");
    const ext = path.join(root, "extensions", "sample", "migrations");
    mkdirSync(core);
    mkdirSync(ext, { recursive: true });
    writeFileSync(path.join(core, "0001_core.sql"), "create table core_thing (id int primary key)");
    writeFileSync(path.join(ext, "0001_own.sql"), "create table ext_sample_thing (core_id int references core_thing (id))");
    await withTestSchema(async (client) => {
      expect(await migrate(client, core, path.join(root, "extensions"))).toEqual(["0001_core.sql", "sample/0001_own.sql"]);
      expect(await pendingMigrations(client, core, path.join(root, "extensions"))).toEqual([]);
    });
  });
});
