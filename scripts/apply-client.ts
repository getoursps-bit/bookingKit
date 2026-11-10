import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, clientSchema, FONTS, type Pack, packSchema } from "../src/brand.schema";
import { contract } from "./lang-contract";

// Writes the files that are worked out from client.json and the language
// packs in languages/:
//   src/app/brand.css                  font imports and the Tailwind theme values
//   src/i18n/languages.generated.ts    the client's languages and what the code needs to know about each
//   src/i18n/packs.generated.ts        their strings, starting content and date names (server and worker only)
//   src/extensions.generated.ts        the extensions that are on
//   src/extension-views.generated.ts   what those extensions show in pages
//   languages/contract.json            what a language pack must hold, for whoever fills one
// Tailwind and the bundler read these when the site is built, so they are
// generated ahead and committed; a unit test fails when they drift apart.
//   pnpm brand           writes the files
//   pnpm brand --check   only says whether they are up to date

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLIENT_FILE = path.join(ROOT, "client.json");
const HEADER = "Generated from client.json by `pnpm brand`. Do not edit: change client.json and run it again.";

function invalid(file: string, issues: { path: PropertyKey[]; message: string }[]): never {
  const problems = issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`${path.relative(ROOT, file)} is not valid:\n${problems.join("\n")}`);
}

/** Reads and checks client.json (or another file of the same shape). */
export function readClient(file = CLIENT_FILE): Client {
  const parsed = clientSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  return parsed.success ? parsed.data : invalid(file, parsed.error.issues);
}

/** Reads and checks one language's pack.json. */
export function readPack(code: string): Pack {
  const file = path.join(ROOT, "languages", code, "pack.json");
  if (!existsSync(file)) throw new Error(`There is no language pack "${code}": languages/${code}/pack.json is missing`);
  const parsed = packSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  return parsed.success ? parsed.data : invalid(file, parsed.error.issues);
}

/** The client's languages, the default one first. */
export function localesOf(client: Client): string[] {
  return [client.languages.default, ...client.languages.others];
}

const stack = (...families: string[]) =>
  [...new Set(families)].map((family) => `"${family}"`).join(", ") + ", system-ui, sans-serif";

/** The stylesheet for one client: font packages first, then the theme values. */
export function brandCss(client: Client): string {
  const { fonts, colors, radius, shadows } = client.theme;
  const sans = FONTS[fonts.sans];
  const perLanguage = Object.entries(fonts.languages).filter(([code]) => localesOf(client).includes(code));
  const displayPerLanguage = Object.entries(fonts.displayLanguages).filter(([code]) => localesOf(client).includes(code));
  const packages = [...new Set([fonts.sans, fonts.display, ...perLanguage.map(([, font]) => font), ...displayPerLanguage.map(([, font]) => font)])];
  // Each language that has a font of its own for body text, headings, or both.
  const own = [...new Set([...perLanguage, ...displayPerLanguage].map(([code]) => code))].map((code) => {
    const body = fonts.languages[code] ? FONTS[fonts.languages[code]] : sans;
    const heading = fonts.displayLanguages[code];
    return {
      code,
      lines: [
        ...(fonts.languages[code] ? [`--font-sans: ${stack(body, sans)};`] : []),
        ...(heading ? [`--font-display: ${stack(FONTS[heading], body)};`] : []),
      ],
    };
  });
  const tokens = [
    `--font-sans: ${stack(sans)};`,
    `--font-display: ${stack(FONTS[fonts.display], sans)};`,
    "",
    ...Object.entries(colors).map(([name, value]) => `--color-${name}: ${value};`),
    "",
    ...Object.entries(radius).map(([name, value]) => `--radius-${name}: ${value};`),
    ...Object.entries(shadows).map(([name, value]) => `--shadow-${name}: ${value};`),
  ];
  return [
    `/* ${HEADER} */`,
    ...packages.map((font) => `@import "@fontsource-variable/${font}";`),
    "",
    "@theme {",
    ...tokens.map((line) => (line ? `  ${line}` : "")),
    "}",
    ...(own.length
      ? [
          "",
          "/* A language that reads better in a font of its own. */",
          "@layer base {",
          ...own.flatMap(({ code, lines }) => [`  html[lang="${code}"] {`, ...lines.map((line) => `    ${line}`), "  }"]),
          "}",
        ]
      : []),
    "",
  ].join("\n");
}

/** The client's languages for all code, browser included: no strings, only what each language is. */
export function languagesTs(client: Client, packs: Record<string, Pack>): string {
  const locales = localesOf(client);
  return [
    `// ${HEADER}`,
    "",
    "/** The site's languages. The default one comes first and has the plain addresses. */",
    `export const LOCALES = ${JSON.stringify(locales)} as const;`,
    "export type Locale = (typeof LOCALES)[number];",
    `export const DEFAULT_LOCALE: Locale = ${JSON.stringify(client.languages.default)};`,
    "",
    "/** What the code needs to know about each language (languages/<code>/pack.json). */",
    "export const PACKS: Record<Locale, { name: string; dir: \"rtl\" | \"ltr\"; formats: string; openGraph: string }> = {",
    ...locales.map((code) => {
      const { name, dir, formats, openGraph } = packs[code]!;
      return `  ${code}: ${JSON.stringify({ name, dir, formats, openGraph })},`;
    }),
    "};",
    "",
  ].join("\n");
}

/** The client's languages' strings and date names. Server and worker only: it carries every language. */
export function packsTs(client: Client, packs: Record<string, Pack>): string {
  const locales = localesOf(client);
  const dates = locales.map((code) => `${packs[code]!.dateFns} as ${code}Dates`).join(", ");
  for (const code of locales) {
    if (!existsSync(path.join(ROOT, "languages", code, "content.json")))
      throw new Error(`languages/${code}/content.json is missing: the starting content in ${code}`);
  }
  return [
    `// ${HEADER}`,
    `import { ${dates} } from "date-fns/locale";`,
    ...locales.map((code) => `import ${code}Content from "../../languages/${code}/content.json" with { type: "json" };`),
    ...locales.map((code) => `import ${code}Messages from "../../languages/${code}/messages.json" with { type: "json" };`),
    'import type { Locale } from "./languages.generated";',
    "",
    `export const MESSAGES = { ${locales.map((code) => `${code}: ${code}Messages`).join(", ")} };`,
    "/** The starting content (services, products, message wording) in each language. */",
    `export const CONTENT: Record<Locale, typeof ${locales[0]}Content> = { ${locales.map((code) => `${code}: ${code}Content`).join(", ")} };`,
    `export const DATE_LOCALES: Record<Locale, typeof ${locales[0]}Dates> = { ${locales.map((code) => `${code}: ${code}Dates`).join(", ")} };`,
    "",
  ].join("\n");
}

/** The registry of the extensions that are on; an extension that is off is not in the build. */
export function extensionsTs(client: Client): string {
  for (const id of client.extensions) {
    if (!existsSync(path.join(ROOT, "extensions", id, "extension.ts")))
      throw new Error(`There is no extension "${id}": extensions/${id}/extension.ts is missing`);
  }
  const name = (id: string) => id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  return [
    `// ${HEADER}`,
    ...client.extensions.map((id) => `import ${name(id)} from "../extensions/${id}/extension";`),
    'import type { Extension } from "./extension/types";',
    "",
    "/** The extensions that are on for this client, in client.json's order. */",
    `export const EXTENSIONS: readonly Extension[] = [${client.extensions.map(name).join(", ")}];`,
    "",
  ].join("\n");
}

/** The views of the extensions that are on and have any (extensions/<id>/views.tsx). */
export function extensionViewsTs(client: Client): string {
  const withViews = client.extensions.filter((id) => existsSync(path.join(ROOT, "extensions", id, "views.tsx")));
  const name = (id: string) => id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  return [
    `// ${HEADER}`,
    ...withViews.map((id) => `import ${name(id)} from "../extensions/${id}/views";`),
    'import type { ExtensionViews } from "./extension/views";',
    "",
    "/** What the extensions that are on show in the core's pages. Pages only: the worker never loads this. */",
    `export const VIEWS: readonly ExtensionViews[] = [${withViews.map(name).join(", ")}];`,
    "",
  ].join("\n");
}

/** Every generated file and what it should hold for this client. */
export function generated(client: Client): Record<string, string> {
  const packs = Object.fromEntries(localesOf(client).map((code) => [code, readPack(code)]));
  return {
    "src/extensions.generated.ts": extensionsTs(client),
    "src/extension-views.generated.ts": extensionViewsTs(client),
    "src/app/brand.css": brandCss(client),
    "src/i18n/languages.generated.ts": languagesTs(client, packs),
    "src/i18n/packs.generated.ts": packsTs(client, packs),
    "languages/contract.json": JSON.stringify(contract(), null, 2) + "\n",
  };
}

function main(): void {
  const client = readClient();
  const { fonts } = client.theme;
  for (const font of new Set([fonts.sans, fonts.display, ...Object.values(fonts.languages), ...Object.values(fonts.displayLanguages)])) {
    if (!existsSync(path.join(ROOT, "node_modules/@fontsource-variable", font, "package.json")))
      throw new Error(`The font "${font}" is not installed: pnpm add @fontsource-variable/${font}`);
  }
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [file, content] of Object.entries(generated(client))) {
    const target = path.join(ROOT, file);
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (content === current) continue;
    stale += 1;
    if (check) console.log(`${file} is out of date`);
    else {
      writeFileSync(target, content);
      console.log(`${file} written`);
    }
  }
  if (stale === 0) console.log("Everything generated from client.json is up to date");
  else if (check) console.log("Run `pnpm brand`");
  process.exitCode = check && stale ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
