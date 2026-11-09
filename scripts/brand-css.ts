import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, clientSchema, FONTS } from "../src/brand.schema";

// Writes src/app/brand.css (the font imports and the Tailwind theme values)
// from client.json. Tailwind reads its theme when the site is built, so the
// stylesheet is generated ahead and committed; a unit test fails when the two
// drift apart.
//   pnpm brand           writes the file
//   pnpm brand --check   only says whether it is up to date

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLIENT_FILE = path.join(ROOT, "client.json");
export const CSS_FILE = path.join(ROOT, "src/app/brand.css");

/** Reads and checks client.json (or another file of the same shape). */
export function readClient(file = CLIENT_FILE): Client {
  const parsed = clientSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`${path.basename(file)} is not valid:\n${problems.join("\n")}`);
}

const stack = (...families: string[]) =>
  [...new Set(families)].map((family) => `"${family}"`).join(", ") + ", system-ui, sans-serif";

/** The stylesheet for one client: font packages first, then the theme values. */
export function brandCss(client: Client): string {
  const { fonts, colors, radius, shadows } = client.theme;
  const sans = FONTS[fonts.sans];
  const tokens = [
    `--font-sans: ${stack(sans)};`,
    `--font-display: ${stack(FONTS[fonts.display], sans)};`,
    `--font-latin: ${stack(FONTS[fonts.latin], sans)};`,
    "",
    ...Object.entries(colors).map(([name, value]) => `--color-${name}: ${value};`),
    "",
    ...Object.entries(radius).map(([name, value]) => `--radius-${name}: ${value};`),
    ...Object.entries(shadows).map(([name, value]) => `--shadow-${name}: ${value};`),
  ];
  return [
    "/* Generated from client.json by `pnpm brand`. Do not edit: change client.json and run it again. */",
    ...[...new Set(Object.values(fonts))].map((font) => `@import "@fontsource-variable/${font}";`),
    "",
    "@theme {",
    ...tokens.map((line) => (line ? `  ${line}` : "")),
    "}",
    "",
  ].join("\n");
}

function main(): void {
  const client = readClient();
  for (const font of new Set(Object.values(client.theme.fonts))) {
    if (!existsSync(path.join(ROOT, "node_modules/@fontsource-variable", font, "package.json")))
      throw new Error(`The font "${font}" is not installed: pnpm add @fontsource-variable/${font}`);
  }
  const css = brandCss(client);
  const current = existsSync(CSS_FILE) ? readFileSync(CSS_FILE, "utf8") : "";
  if (process.argv.includes("--check")) {
    console.log(css === current ? "brand.css is up to date" : "brand.css is out of date: run `pnpm brand`");
    process.exitCode = css === current ? 0 : 1;
    return;
  }
  writeFileSync(CSS_FILE, css);
  console.log(css === current ? "brand.css unchanged" : "brand.css written");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
