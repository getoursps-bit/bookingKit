import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  csrfMatches,
  formTimestamp,
  looksHuman,
  MIN_FILL_MS,
  signValue,
  verifySignedValue,
} from "@/core/platform/security";

const SECRET = "test-secret";

describe("signed values", () => {
  it("round-trips and rejects tampering", () => {
    const signed = signValue(SECRET, "customer-42");
    expect(verifySignedValue(SECRET, signed)).toBe("customer-42");
    expect(verifySignedValue(SECRET, signed.replace("42", "43"))).toBeNull();
    expect(verifySignedValue("other-secret", signed)).toBeNull();
    expect(verifySignedValue(SECRET, "no-signature")).toBeNull();
  });
});

describe("CSRF", () => {
  it("needs matching cookie and form tokens", () => {
    expect(csrfMatches("abc", "abc")).toBe(true);
    expect(csrfMatches("abc", "abd")).toBe(false);
    expect(csrfMatches(undefined, "abc")).toBe(false);
    expect(csrfMatches("abc", undefined)).toBe(false);
  });
});

describe("bot check", () => {
  const renderedAt = 1_000_000;
  const stamp = formTimestamp(SECRET, renderedAt);

  it("accepts a form filled slowly with the hidden field empty", () => {
    expect(looksHuman(SECRET, { renderedAt: stamp }, renderedAt + MIN_FILL_MS)).toBe(true);
  });

  it("rejects a filled hidden field, a fast fill, or a forged timestamp", () => {
    expect(looksHuman(SECRET, { honeypot: "x", renderedAt: stamp }, renderedAt + MIN_FILL_MS)).toBe(false);
    expect(looksHuman(SECRET, { renderedAt: stamp }, renderedAt + 500)).toBe(false);
    expect(looksHuman(SECRET, { renderedAt: `${renderedAt}.forged` }, renderedAt + MIN_FILL_MS)).toBe(false);
    expect(looksHuman(SECRET, {}, renderedAt + MIN_FILL_MS)).toBe(false);
  });
});

describe("content security policy", () => {
  it("blocks framing, plugins and foreign form targets", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows only scripts with the request's nonce, never inline scripts in general", () => {
    const csp = contentSecurityPolicy("abc123");
    const scripts = csp.split("; ").find((directive) => directive.startsWith("script-src"))!;
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
  });
});
