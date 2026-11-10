import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, type Locale, localePath, toLocale } from "../../i18n/locales";
import { getConfig } from "../platform/config";
import { CSRF_COOKIE, csrfMatches, looksHuman } from "../platform/security";
import { DRAFT_COOKIE, DRAFT_MAX_AGE_S, type Draft, decodeDraft, encodeDraft } from "./draft";

// Helpers for the booking API routes. Each route accepts a normal form post
// (and answers with a redirect to the next step) or a fetch that asks for JSON.

export async function readForm(request: NextRequest): Promise<Record<string, string>> {
  return (await readFormWithFiles(request)).form;
}

/** The form's text fields, plus any chosen files by field name. An empty file input adds nothing. */
export async function readFormWithFiles(
  request: NextRequest,
): Promise<{ form: Record<string, string>; files: Record<string, File[]> }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return { form: Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value ?? "")])), files: {} };
  }
  const data = await request.formData().catch(() => null);
  const form: Record<string, string> = {};
  const files: Record<string, File[]> = {};
  data?.forEach((value, key) => {
    if (typeof value === "string") form[key] = value;
    else if (value.size > 0) (files[key] ??= []).push(value);
  });
  return { form, files };
}

/** All values of a repeated form field, such as `pet.0.name`, grouped by index. */
export function grouped(form: Record<string, string>, prefix: string): Record<string, string>[] {
  const groups = new Map<number, Record<string, string>>();
  for (const [key, value] of Object.entries(form)) {
    const match = new RegExp(`^${prefix}\\.(\\d+)\\.(\\w+)$`).exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    groups.set(index, { ...groups.get(index), [match[2]!]: value });
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

export function wantsJson(request: NextRequest): boolean {
  return (request.headers.get("accept") ?? "").includes("application/json");
}

/** The client address, used only as a rate-limit key. The proxy in front sets X-Forwarded-For. */
export function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 100);
}

export function csrfOk(request: NextRequest, form: Record<string, string>): boolean {
  return csrfMatches(request.cookies.get(CSRF_COOKIE)?.value, form.csrf);
}

export function humanOk(form: Record<string, string>): boolean {
  return looksHuman(getConfig().SESSION_SECRET, { honeypot: form.website, renderedAt: form.renderedAt });
}

export function getDraft(request: NextRequest): Draft {
  return decodeDraft(getConfig().SESSION_SECRET, request.cookies.get(DRAFT_COOKIE)?.value);
}

function secure(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:" || getConfig().APP_BASE_URL.startsWith("https:");
}

export function setDraft(request: NextRequest, response: NextResponse, draft: Draft | null): void {
  if (!draft) {
    response.cookies.delete(DRAFT_COOKIE);
    return;
  }
  response.cookies.set(DRAFT_COOKIE, encodeDraft(getConfig().SESSION_SECRET, draft), {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(request),
    path: "/",
    maxAge: DRAFT_MAX_AGE_S,
  });
}

export function setCookie(
  request: NextRequest,
  response: NextResponse,
  name: string,
  value: string,
  expires: Date,
): void {
  response.cookies.set(name, value, { httpOnly: true, sameSite: "lax", secure: secure(request), path: "/", expires });
}

/** The language of the page that sent this request, kept in a cookie by the proxy. */
export function requestLocale(request: NextRequest): Locale {
  return toLocale(request.cookies.get(LOCALE_COOKIE)?.value);
}

/**
 * Sends the browser on to `path` in the visitor's language (303, so a refresh does not post again), or
 * answers a fetch with JSON that carries the same address.
 */
export function next(
  request: NextRequest,
  path: string,
  body: Record<string, unknown> = {},
  status = 200,
): NextResponse {
  const url = new URL(localePath(requestLocale(request), path), getConfig().APP_BASE_URL);
  if (wantsJson(request)) return NextResponse.json({ ...body, next: url.pathname + url.search }, { status });
  return NextResponse.redirect(url, 303);
}

/** The address of a booking step, with an optional error key for the page to show. */
export function stepPath(step: string, params: Record<string, string | undefined> = {}): string {
  const search = new URLSearchParams({ step });
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `/book?${search.toString()}`;
}
