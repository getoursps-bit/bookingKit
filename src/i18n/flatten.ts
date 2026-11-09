import type { Paths } from "./t";

type Group = { [key: string]: string | Group };

function walk(group: Group, prefix: string): Record<string, string> {
  return Object.assign(
    {},
    ...Object.entries(group).map(([key, value]) =>
      typeof value === "string" ? { [`${prefix}${key}`]: value } : walk(value, `${prefix}${key}.`),
    ),
  ) as Record<string, string>;
}

/** The strings of a language file as one flat list of dotted keys: `flatten(he)["home.heroTitle"]`. */
export function flatten<File extends Group>(file: File): Record<Paths<File>, string> {
  return walk(file, "");
}
