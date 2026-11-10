import { createHmac, randomBytes } from "node:crypto";
import { getConfig } from "../config";

/**
 * Keyed hash for anything secret that is kept in the database: link tokens,
 * device tokens and codes. Keyed with SESSION_SECRET, so a copy of the
 * database alone cannot test guesses against a six-digit code.
 */
export function secretHash(value: string): string {
  return createHmac("sha256", getConfig().SESSION_SECRET).update(value).digest("hex");
}

/** A random 32-byte token, safe to put in a URL or a cookie. */
export function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}
