import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Kept free of Next.js and config imports: next.config.ts loads this file at
// build time to set the security headers.

/**
 * Strict content security policy. With a per-request nonce (set by
 * src/proxy.ts on every page), only scripts carrying that nonce, and the
 * scripts they load, may run. Without one (static files), no inline script runs.
 */
export function contentSecurityPolicy(nonce?: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Dev mode needs eval for React's debugging information.
    "script-src": [
      "'self'",
      ...(nonce ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []),
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Style attributes cannot carry a nonce, so inline styles stay allowed.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...(process.env.STORAGE_ENDPOINT ? [new URL(process.env.STORAGE_ENDPOINT).origin] : []),
    ],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Signs a cookie value as `value.signature`. */
export function signValue(secret: string, value: string): string {
  return `${value}.${hmac(secret, value)}`;
}

/** Returns the original value if the signature is valid, otherwise null. */
export function verifySignedValue(secret: string, signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  return safeEqual(signed.slice(dot + 1), hmac(secret, value)) ? value : null;
}

export const CSRF_COOKIE = "bk_csrf";

/** A random token for the CSRF cookie. The form carries the same value back. */
export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Double-submit check: the form field must equal the cookie value. */
export function csrfMatches(cookieToken: string | undefined, formToken: string | undefined): boolean {
  if (!cookieToken || !formToken) return false;
  return safeEqual(cookieToken, formToken);
}

export const MIN_FILL_MS = 3_000;

/**
 * Bot check for public forms: the hidden field must be empty and the form must
 * have been open at least MIN_FILL_MS. `renderedAt` is a signed timestamp
 * written into the form when it was served.
 */
export function looksHuman(
  secret: string,
  input: { honeypot?: string; renderedAt?: string },
  now: number = Date.now(),
): boolean {
  if (input.honeypot) return false;
  if (!input.renderedAt) return false;
  const value = verifySignedValue(secret, input.renderedAt);
  const renderedAt = value === null ? NaN : Number(value);
  if (!Number.isFinite(renderedAt)) return false;
  return now - renderedAt >= MIN_FILL_MS;
}

/** The signed timestamp to place in a form's hidden `renderedAt` field. */
export function formTimestamp(secret: string, now: number = Date.now()): string {
  return signValue(secret, String(now));
}
