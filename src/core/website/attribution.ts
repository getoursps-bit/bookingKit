import { z } from "zod";
import { signValue, verifySignedValue } from "../platform/security";

// Campaign tags from the first visit (for example the Instagram link), kept in
// a signed cookie until the visitor books. Kept free of database imports
// because src/proxy.ts loads it on every request.

export const ATTRIBUTION_COOKIE = "bk_src";
export const ATTRIBUTION_MAX_AGE_S = 30 * 24 * 60 * 60;

const TAGS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;

const Attribution = z.partialRecord(z.enum([...TAGS, "landing"]), z.string().max(200));
export type Attribution = z.output<typeof Attribution>;

/** The campaign tags in a URL, plus the page they landed on, or null when there are none. */
export function attributionFromUrl(url: URL): Attribution | null {
  const found: Attribution = {};
  for (const tag of TAGS) {
    const value = url.searchParams.get(tag)?.trim();
    if (value) found[tag] = value.slice(0, 200);
  }
  if (Object.keys(found).length === 0) return null;
  found.landing = url.pathname.slice(0, 200);
  return found;
}

export function encodeAttribution(secret: string, data: Attribution): string {
  return signValue(secret, Buffer.from(JSON.stringify(data)).toString("base64url"));
}

/** The tags in a cookie, or an empty object when the cookie is missing, tampered with or malformed. */
export function readAttribution(secret: string, cookie: string | undefined): Attribution {
  if (!cookie) return {};
  const value = verifySignedValue(secret, cookie);
  if (!value) return {};
  try {
    const parsed = Attribution.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
