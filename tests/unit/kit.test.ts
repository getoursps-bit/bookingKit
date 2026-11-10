import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientProjects, createProject, KIT_ROOT, kitHas, readBlueprint, updateProject } from "../../scripts/kit";
import { blueprintSchema, problems } from "../../scripts/kit/blueprint";
import { clientSchema } from "../../src/brand.schema";

// `pnpm kit new`: a blueprint becomes a client's project folder.

// Only the kit makes projects; in a client's project (it has a kit.json) these do not apply.
const isKit = !existsSync(path.join(KIT_ROOT, "kit.json"));
const example = isKit ? readFileSync(path.join(KIT_ROOT, "blueprints/example.yaml"), "utf8") : "";
const kit = () => {
  const has = kitHas();
  return { packs: has.packs, extensions: has.extensions.map((extension) => extension.id) };
};
const check = (change: Record<string, unknown>) => problems(blueprintSchema.parse({ ...readBlueprint(example), ...change }), kit());

describe.skipIf(!isKit)("a client's blueprint", () => {
  it("the example is valid, and every extension of the kit has a line about it", () => {
    expect(readBlueprint(example).folder).toBe("physioStudio");
    for (const extension of kitHas().extensions) expect(extension.about, extension.id).toMatch(/\w.*\.$/);
  });

  it("says in plain words what cannot be done", () => {
    expect(check({ languages: { default: "fr", others: [] }, name: { fr: "Studio" } })[0]).toContain('no language pack "fr"');
    expect(check({ extensions: ["teleport"] })[0]).toContain('no extension "teleport"');
    expect(check({ extensions: ["pets"] })[0]).toContain("leave `services` and `products` out");
    expect(check({ services: [] })[0]).toContain("at least one service");
    expect(check({ hours: { sun: "17:00-09:00", mon: "closed", tue: "closed", wed: "closed", thu: "closed", fri: "closed", sat: "closed" } })[0]).toContain(
      "17:00 is not before 09:00",
    );
    expect(() => readBlueprint(example.replace("folder: physioStudio", "folder: Physio Studio"))).toThrow(/folder/);
  });
});

describe.skipIf(!isKit)("pnpm kit new", () => {
  it("makes a project that is the client's own and checks out", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "kit-new-"));
    try {
      const made = createProject(readBlueprint(example), { parent, blueprintText: example, repo: false, now: new Date("2026-11-10T10:00:00Z") });
      const read = (file: string) => readFileSync(path.join(made.target, file), "utf8");

      // The client, and none of the kit's own brand.
      const client = clientSchema.parse(JSON.parse(read("client.json")));
      expect(client.brand.name).toEqual({ he: "סטודיו פיזיו", en: "Physio Studio" });
      expect(client.extensions).toEqual(["approval", "map-links"]);
      expect(client.theme.colors.brand).toBe("#1f6f78");
      expect(client.brand.messages.en).toEqual({ "home.servicesTitle": "Our treatments" });
      expect(read("client.json")).not.toMatch(/fluff/i);

      // The starting content, in every pack; a missing translation stands in the default language and is listed.
      const seed = JSON.parse(read("db/seed/data.json")) as { services: { key: string; price_from_agorot: number; bookable_online: boolean }[]; opening_hours: unknown[]; message_templates: unknown[] };
      expect(seed.services.map((service) => service.key)).toEqual(["first_visit", "treatment", "home_visit"]);
      expect(seed.services[2]).toMatchObject({ price_from_agorot: 45000, bookable_online: false });
      expect(seed.opening_hours[6]).toEqual({ weekday: 6, opens: null, closes: null, closed: true });
      expect(seed.message_templates.length).toBeGreaterThan(5);
      const english = JSON.parse(read("languages/en/content.json")) as Record<string, Record<string, Record<string, string>>>;
      expect(Object.keys(english.service!)).toEqual(["first_visit", "treatment", "home_visit"]);
      expect(english.service!.home_visit!.name).toBe("ביקור בית");
      expect(english.message_template).toBeDefined();
      expect(made.borrowed).toEqual({ he: [], en: ["service.home_visit.name"] });
      expect(Object.keys((JSON.parse(read("languages/ar/content.json")) as typeof english).service!)).toHaveLength(3);

      // Its own names and database, and the generated files written for it.
      expect(JSON.parse(read("package.json")).name).toBe("physiostudio");
      expect(read("docker/compose.dev.yml")).toContain("name: physiostudio");
      expect(read("docker/compose.dev.yml")).toContain('"5436:5432"');
      expect(read("tests/setup/dev-db.ts")).not.toContain("5435");
      expect(read("CLAUDE.md")).toMatch(/^# Physio Studio\n/);
      expect(read("CLAUDE.md")).not.toContain("5435");
      expect(read(".github/workflows/ci.yml")).toContain("client: [client.json, tests/fixtures/client.notes.json, tests/fixtures/client.plain.json, tests/fixtures/client.requests.json]");
      expect(read("src/extensions.generated.ts")).toContain("extensions/approval/extension");
      expect(read("src/extensions.generated.ts")).not.toContain("pets");
      expect(read("src/app/brand.css")).toContain("#1f6f78");
      expect(read("languages/contract.json")).toContain("first_visit");
      expect(existsSync(path.join(made.target, "extensions/pets/extension.ts"))).toBe(true);
      expect(existsSync(path.join(made.target, "node_modules"))).toBe(false);

      // The starting prompt names the client, the wishes and what is left.
      const prompt = read("INITIAL_PROMPT.md");
      expect(prompt).toContain("# Starting prompt: סטודיו פיזיו");
      expect(prompt).toContain("A health questionnaire the customer fills in before a first visit");
      expect(prompt).toContain("`languages/en/content.json` (service.home_visit.name)");
      expect(prompt).toContain("`pets`: ");
      expect(prompt).not.toContain("still the kit's");
      expect(read("blueprint.yaml")).toBe(example);
      expect(JSON.parse(read("kit.json"))).toMatchObject({ kit: "bookingKit", made: "2026-11-10" });

      expect(() => createProject(readBlueprint(example), { parent, blueprintText: example, repo: false })).toThrow(/already exists/);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 120_000);
});

// A whole copy of the kit's history is needed; a shallow checkout (some CI setups) cannot be cloned from.
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const fullHistory = isKit && git(KIT_ROOT, "rev-parse", "--is-shallow-repository") === "false";

describe.skipIf(!fullHistory)("pnpm kit update", () => {
  it("takes the kit's later changes into a client's project and keeps what is the client's", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kit-update-"));
    const author = { GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" };
    const before = { ...process.env };
    Object.assign(process.env, author);
    try {
      // A copy of the kit as it is committed, to change without touching the real one.
      const kit = path.join(dir, "kit");
      git(KIT_ROOT, "clone", "-q", KIT_ROOT, kit);
      git(kit, "checkout", "-q", "-B", "main");
      const commitKit = (message: string) => {
        git(kit, "add", "-A");
        git(kit, "commit", "-q", "-m", message);
      };
      const clients = path.join(dir, "clients");
      const blueprint = readFileSync(path.join(kit, "blueprints/example.yaml"), "utf8");
      const made = createProject(readBlueprint(blueprint, kit), {
        parent: clients,
        blueprintText: blueprint,
        root: kit,
        modules: path.join(KIT_ROOT, "node_modules"),
      });
      const project = made.target;
      const read = (file: string) => readFileSync(path.join(project, file), "utf8");

      // One commit on top of the kit's history, the kit remembered, and level with it.
      expect(git(project, "log", "--format=%s", "-1")).toMatch(/^Start Physio Studio from bookingKit /);
      expect(Number(git(project, "rev-list", "--count", "HEAD"))).toBe(Number(git(kit, "rev-list", "--count", "HEAD")) + 1);
      expect(git(project, "status", "--porcelain")).toBe("");
      expect(clientProjects(clients, kit)).toMatchObject([{ folder: "physioStudio", behind: 0 }]);
      expect(updateProject(project)).toMatchObject({ state: "level" });

      // The kit moves on: a new file, a database change, and a line in a file the client's project rewrote elsewhere.
      mkdirSync(path.join(kit, "db/migrations"), { recursive: true });
      writeFileSync(path.join(kit, "db/migrations/9999_later.sql"), "-- a later change\n");
      writeFileSync(path.join(kit, "docs/later.md"), "A later note.\n");
      appendFileSync(path.join(kit, "README.md"), "\nA line added to the kit later.\n");
      commitKit("A later kit change");
      expect(clientProjects(clients, kit)).toMatchObject([{ behind: 1 }]);

      const updated = updateProject(project, { now: new Date("2026-12-01T10:00:00Z") });
      expect(updated).toMatchObject({ state: "updated", changes: 1, migrations: ["db/migrations/9999_later.sql"] });
      expect(read("docs/later.md")).toBe("A later note.\n");
      expect(read("README.md")).toMatch(/^# Physio Studio\n/);
      expect(read("README.md")).toContain("A line added to the kit later.");
      expect(JSON.parse(read("client.json")).brand.name.en).toBe("Physio Studio");
      expect(read("src/extensions.generated.ts")).toContain("extensions/approval/extension");
      expect(JSON.parse(read("kit.json"))).toMatchObject({ commit: git(kit, "rev-parse", "--short", "HEAD"), updated: "2026-12-01" });
      expect(git(project, "status", "--porcelain")).toBe("");
      expect(clientProjects(clients, kit)).toMatchObject([{ behind: 0 }]);

      // The kit changes a line the client's project also changed: it stops, names the file, and can go back.
      const packageFile = path.join(kit, "package.json");
      writeFileSync(packageFile, readFileSync(packageFile, "utf8").replace('"name": "bookingkit"', '"name": "bookingkit-two"'));
      commitKit("The kit renames itself");
      expect(updateProject(project)).toMatchObject({ state: "conflicts", files: ["package.json"] });
      git(project, "merge", "--abort");
      expect(JSON.parse(read("package.json")).name).toBe("physiostudio");

      // A project with uncommitted work is not touched.
      writeFileSync(path.join(project, "notes.txt"), "work in progress\n");
      expect(() => updateProject(project)).toThrow(/not committed/);
    } finally {
      for (const key of Object.keys(author)) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
