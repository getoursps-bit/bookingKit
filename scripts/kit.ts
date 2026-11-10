// Makes a new client's project from this kit.
//   pnpm kit new blueprints/<client>.yaml     from a filled-in blueprint
//   pnpm kit new                              asks the questions, writes the blueprint, then the same
//   pnpm kit new <blueprint> --into <folder>  where the project folder is made (default: next to the kit)
// The new project is a separate git repo with no link back to the kit. It
// holds the kit's whole code (extensions that are off included), the client's
// client.json and starting content, and INITIAL_PROMPT.md for the first
// working session. Nothing is installed and no server is contacted.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prompts from "@clack/prompts";
import { parse, stringify } from "yaml";
import { clientSchema } from "../src/brand.schema";
import { type Blueprint, blueprintSchema, clientFrom, contentFrom, DAYS, initialPrompt, languagesOf, problems, seedFrom } from "./kit/blueprint";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const folders = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** The language packs and extensions the kit has. */
export function kitHas(root = KIT_ROOT): { packs: string[]; extensions: { id: string; about: string }[] } {
  return {
    packs: folders(path.join(root, "languages")),
    extensions: folders(path.join(root, "extensions")).map((id) => ({ id, about: aboutExtension(path.join(root, "extensions", id, "extension.ts")) })),
  };
}

/** The first sentence of the comment that opens an extension's manifest. */
function aboutExtension(file: string): string {
  const comment = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("// "))
    .map((line) => line.slice(3))
    .join(" ");
  return /^(.*?\.)(\s|$)/.exec(comment)?.[1] ?? comment;
}

/** Reads and checks a blueprint file; throws with every problem in plain words. */
export function readBlueprint(text: string, root = KIT_ROOT): Blueprint {
  const parsed = blueprintSchema.safeParse(parse(text));
  if (!parsed.success)
    throw new Error(`The blueprint is not valid:\n${parsed.error.issues.map((issue) => `  ${issue.path.join(".") || "(top)"}: ${issue.message}`).join("\n")}`);
  const kit = kitHas(root);
  const found = problems(parsed.data, { packs: kit.packs, extensions: kit.extensions.map((extension) => extension.id) });
  if (found.length) throw new Error(`The blueprint cannot be used yet:\n${found.map((line) => `  ${line}`).join("\n")}`);
  return parsed.data;
}

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** Swaps one piece of a copied file; fails loudly when the kit's file no longer has that piece. */
function edit(target: string, file: string, changes: [from: string | RegExp, to: string][]): void {
  const full = path.join(target, file);
  let text = readFileSync(full, "utf8");
  for (const [from, to] of changes) {
    const next = text.replace(from, () => to);
    if (next === text && String(from) !== to) throw new Error(`${file} no longer has ${String(from)}; scripts/kit.ts needs updating`);
    text = next;
  }
  writeFileSync(full, text);
}

const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

export type Made = { target: string; borrowed: Record<string, string[]> };

/**
 * Writes the project folder for a blueprint. `repo: false` leaves out the
 * new project's first commit (the tests use it).
 */
export function createProject(
  blueprint: Blueprint,
  options: { parent: string; blueprintText: string; root?: string; repo?: boolean; now?: Date },
): Made {
  const root = options.root ?? KIT_ROOT;
  // The real path: the new project's scripts compare their own path with the one they were started by.
  mkdirSync(options.parent, { recursive: true });
  const target = path.join(realpathSync(options.parent), blueprint.folder);
  if (existsSync(target)) throw new Error(`${target} already exists. Choose another folder name, or move that folder away yourself.`);
  const kit = kitHas(root);
  const lower = blueprint.folder.toLowerCase();
  const name = blueprint.name.en ?? blueprint.name[blueprint.languages.default]!;

  // The kit's files as they are now: what git tracks, and new files not ignored.
  const files = git(root, "ls-files", "-co", "--exclude-standard", "-z").split("\0").filter(Boolean);
  for (const file of files) {
    const from = path.join(root, file);
    if (!existsSync(from)) continue;
    // Other clients' blueprints stay in the kit; only the example goes along.
    if (file.startsWith("blueprints/") && file !== "blueprints/example.yaml") continue;
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    copyFileSync(from, path.join(target, file));
  }

  // The client itself.
  const kitClient = clientSchema.parse(JSON.parse(readFileSync(path.join(root, "client.json"), "utf8")));
  writeFileSync(path.join(target, "client.json"), json(clientSchema.parse(clientFrom(blueprint, kitClient))));

  // Its starting content, in every pack the kit has: the reference pack must always match the seed.
  const seedFile = path.join(target, "db/seed/data.json");
  writeFileSync(seedFile, json(seedFrom(blueprint, JSON.parse(readFileSync(seedFile, "utf8")))));
  const borrowed: Record<string, string[]> = {};
  for (const code of kit.packs) {
    const file = path.join(target, "languages", code, "content.json");
    const made = contentFrom(blueprint, code, JSON.parse(readFileSync(file, "utf8")));
    writeFileSync(file, json(made.content));
    if (languagesOf(blueprint).includes(code)) borrowed[code] = made.borrowed;
  }

  // Its own names and its own local database.
  const port = String(blueprint.postgresPort);
  edit(target, "package.json", [['"name": "bookingkit"', `"name": "${lower}"`]]);
  edit(target, "docker/compose.dev.yml", [
    ["name: bookingkit", `name: ${lower}`],
    ['"5435:5432"', `"${port}:5432"`],
  ]);
  edit(target, "tests/setup/dev-db.ts", [[/localhost:5435/g, `localhost:${port}`]]);
  edit(target, "README.md", [
    [/^# bookingKit\n[\s\S]*?(?=\n## Local setup)/, `# ${name}\n\n${blueprint.business}. Made from bookingKit; \`INITIAL_PROMPT.md\` says what was set up and what is left to do.\n`],
    [/5435/g, port],
  ]);
  edit(target, "CLAUDE.md", [
    [
      /^# bookingKit\n[\s\S]*?(?=\n## Kit rules)/,
      `# ${name}\n\n${blueprint.business}: a public site, online booking and an owner area. This project was made from bookingKit, a shared template, by \`pnpm kit new\`; \`kit.json\` says from which commit and \`blueprint.yaml\` is what it was made from. \`docs/designs/\` and \`docs/reference/\` are the kit's own history and explain why the engine works the way it does.\n`,
    ],
    [
      /- A change that only one client needs belongs in that client's repo, as an\n  extension or a view of its own, not here\.\n/,
      "- What this client needs beyond the kit is an extension of its own under\n  `extensions/`, or a view of its own in `theme/views.ts`.\n",
    ],
    [
      /- Client repos are separate clones with their own database, image and domain\.\n  Never connect this repo to a client's server or database\.\n/,
      "- This repo has its own database, image and domain. The working session\n  never connects to the live server or database.\n",
    ],
    [/5435/g, port],
  ]);

  // The test clients that still fit: the ones with pets need the kit's grooming services.
  if (blueprint.services) {
    const fixtures = readdirSync(path.join(target, "tests/fixtures"))
      .filter((file) => /^client\..+\.json$/.test(file))
      .filter((file) => !(JSON.parse(readFileSync(path.join(target, "tests/fixtures", file), "utf8")) as { extensions: string[] }).extensions.includes("pets"))
      .map((file) => `tests/fixtures/${file}`);
    edit(target, ".github/workflows/ci.yml", [[/client: \[client\.json[^\]]*\]/, `client: [${["client.json", ...fixtures].join(", ")}]`]]);
  }

  const now = options.now ?? new Date();
  const commit = git(root, "rev-parse", "--short", "HEAD");
  const dirty = git(root, "status", "--porcelain") !== "";
  writeFileSync(path.join(target, "kit.json"), json({ kit: "bookingKit", commit, uncommittedChanges: dirty, made: now.toISOString().slice(0, 10) }));
  writeFileSync(path.join(target, "blueprint.yaml"), options.blueprintText);
  writeFileSync(
    path.join(target, "INITIAL_PROMPT.md"),
    initialPrompt(blueprint, {
      extensions: kit.extensions,
      borrowed,
      kitColours: !blueprint.theme.colors,
      kitCommit: commit + (dirty ? " plus uncommitted changes" : ""),
      date: now.toISOString().slice(0, 10),
    }),
  );

  // The files generated from client.json, written by the new project's own
  // script. It needs the libraries, so it borrows the kit's for this one run.
  const modules = path.join(target, "node_modules");
  symlinkSync(path.join(root, "node_modules"), modules, "dir");
  try {
    const tsx = path.join(root, "node_modules/.bin/tsx");
    execFileSync(tsx, [path.join(target, "scripts/apply-client.ts")], { cwd: target, stdio: "pipe" });
    execFileSync(tsx, [path.join(target, "scripts/lang-check.ts"), ...languagesOf(blueprint)], { cwd: target, stdio: "pipe" });
  } catch (error) {
    const output = (error as { stdout?: Buffer; stderr?: Buffer }).stdout?.toString() ?? "";
    const problem = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
    throw new Error(`The new project's own checks failed (the folder is left at ${target} to look at):\n${output}${problem}`);
  } finally {
    unlinkSync(modules);
  }

  if (options.repo !== false) {
    git(target, "init", "-q", "-b", "main");
    git(target, "add", "-A");
    git(target, "commit", "-q", "-m", `Start ${name} from bookingKit ${commit}`);
  }
  return { target, borrowed };
}

/** A host port for the new project's Postgres: one above the highest that the folders next to the kit use. */
function nextPort(parent: string): number {
  let highest = 5435;
  for (const folder of folders(parent)) {
    const file = path.join(parent, folder, "docker/compose.dev.yml");
    if (!existsSync(file)) continue;
    const port = /"(\d+):5432"/.exec(readFileSync(file, "utf8"))?.[1];
    if (port) highest = Math.max(highest, Number(port));
  }
  return highest + 1;
}

/** Asks for a blueprint, question by question. Returns the YAML text, or null when the person stops. */
async function ask(parent: string): Promise<string | null> {
  const kit = kitHas();
  const stop = <T>(value: T | symbol): value is symbol => prompts.isCancel(value);
  prompts.intro("A new client from bookingKit");

  const main = await prompts.select({
    message: "The site's default language (the one the owner writes in)",
    options: kit.packs.map((code) => ({ value: code, label: code })),
    initialValue: kit.packs.includes("he") ? "he" : kit.packs[0]!,
  });
  if (stop(main)) return null;
  const others = await prompts.multiselect({
    message: "Other languages of the site (space to tick, enter to go on)",
    options: kit.packs.filter((code) => code !== main).map((code) => ({ value: code, label: code })),
    required: false,
  });
  if (stop(others)) return null;
  const languages = [main, ...others];

  const name: Record<string, string> = {};
  for (const code of languages) {
    const value = await prompts.text({ message: `The business name in ${code}`, validate: (text) => (text?.trim() ? undefined : "A name is needed") });
    if (stop(value)) return null;
    name[code] = value.trim();
  }
  const business = await prompts.text({
    message: "What kind of business is it, in a few words?",
    placeholder: "A physiotherapy clinic with one therapist",
    validate: (text) => (text?.trim() ? undefined : "A few words are needed"),
  });
  if (stop(business)) return null;
  const folder = await prompts.text({
    message: "The project's folder name, in camelCase",
    placeholder: "physioStudio",
    validate: (text) =>
      !/^[a-z][a-zA-Z0-9]*$/.test(text ?? "") ? "Letters and digits only, starting with a small letter" : existsSync(path.join(parent, text!)) ? "That folder already exists" : undefined,
  });
  if (stop(folder)) return null;

  const extensions = await prompts.multiselect({
    message: "Extensions to switch on (the others stay in the code, off)",
    options: kit.extensions.map((extension) => ({ value: extension.id, label: extension.id, hint: extension.about })),
    required: false,
  });
  if (stop(extensions)) return null;

  const services: { key: string; name: Record<string, string>; minutes: number; price: number }[] = [];
  if (!extensions.includes("pets")) {
    for (;;) {
      const service = await prompts.text({
        message: services.length ? "Another service's name (empty to go on)" : `The first service's name, in ${main}`,
        validate: (text) => (services.length || text?.trim() ? undefined : "At least one service is needed"),
      });
      if (stop(service)) return null;
      if (!service?.trim()) break;
      const minutes = await prompts.text({ message: "How many minutes does it take?", validate: (text) => (/^[1-9]\d*$/.test(text ?? "") ? undefined : "A whole number of minutes") });
      if (stop(minutes)) return null;
      const price = await prompts.text({ message: 'Its "from" price in shekels', validate: (text) => (/^\d+(\.\d+)?$/.test(text ?? "") ? undefined : "A number") });
      if (stop(price)) return null;
      services.push({ key: `service_${services.length + 1}`, name: { [main]: service.trim() }, minutes: Number(minutes), price: Number(price) });
    }
  }

  const hours: Record<string, string> = {};
  if (!extensions.includes("pets")) {
    for (const day of DAYS) {
      const value = await prompts.text({
        message: `Opening hours on ${day} ("09:00-17:00" or "closed")`,
        initialValue: day === "fri" || day === "sat" ? "closed" : "09:00-17:00",
        validate: (text) => (/^(closed|\d{2}:\d{2}-\d{2}:\d{2})$/.test(text ?? "") ? undefined : 'Like "09:00-17:00", or "closed"'),
      });
      if (stop(value)) return null;
      hours[day] = value;
    }
  }

  const wishes: string[] = [];
  for (;;) {
    const wish = await prompts.text({ message: wishes.length ? "Another wish (empty to finish)" : "Something this client wishes for that is their own (empty for none)" });
    if (stop(wish)) return null;
    if (!wish?.trim()) break;
    wishes.push(wish.trim());
  }

  const blueprint = {
    folder,
    name,
    business: business.trim(),
    languages: { default: main, others },
    extensions,
    ...(services.length ? { services, hours } : {}),
    postgresPort: nextPort(parent),
    wishes,
  };
  return stringify(blueprint);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "new") {
    console.log("Usage: pnpm kit new [blueprint.yaml] [--into <folder the project folder is made in>]");
    process.exitCode = 2;
    return;
  }
  if (existsSync(path.join(KIT_ROOT, "kit.json"))) {
    console.error("This is a client's project, made from the kit. New clients are made from the kit itself.");
    process.exitCode = 1;
    return;
  }
  const into = args.indexOf("--into");
  const parent = path.resolve(into >= 0 ? args[into + 1]! : path.join(KIT_ROOT, ".."));
  const file = args.slice(1).find((arg, index) => !arg.startsWith("--") && args[index] !== "--into");
  let text: string;
  if (file) text = readFileSync(path.resolve(file), "utf8");
  else {
    const asked = await ask(parent);
    if (asked === null) {
      prompts.cancel("Stopped; nothing was made.");
      return;
    }
    text = asked;
    const kept = path.join(KIT_ROOT, "blueprints", `${(parse(text) as { folder: string }).folder}.yaml`);
    mkdirSync(path.dirname(kept), { recursive: true });
    writeFileSync(kept, text);
    prompts.outro(`The blueprint is kept at ${path.relative(process.cwd(), kept)}`);
  }
  const blueprint = readBlueprint(text);
  const made = createProject(blueprint, { parent, blueprintText: text });
  console.log(`Made ${made.target}`);
  console.log("Next: open that folder, read INITIAL_PROMPT.md, and give it to the first working session there.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
