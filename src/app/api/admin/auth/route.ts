import type { NextRequest } from "next/server";
import { clientAddress, csrfOk, next, readForm, setCookie } from "@/server/booking/http";
import { toLocale } from "@/i18n/locales";
import { getConfig } from "@/server/config";
import { hit } from "@/server/repos/rateLimits";
import { signValue, verifySignedValue } from "@/server/security";
import {
  checkEmailCode,
  checkPassword,
  checkTotp,
  createSession,
  EMAIL_CODE_TTL_MIN,
  EMAIL_PENDING_COOKIE,
  PENDING_COOKIE,
  revokeSession,
  sendEmailCode,
  SESSION_COOKIE,
} from "@/server/staff/auth";

export const dynamic = "force-dynamic";

const PENDING_MS = 5 * 60_000;

/** Login, either password then app code or a code by email, and logout. */
export async function POST(request: NextRequest) {
  const form = await readForm(request);
  if (!csrfOk(request, form)) return next(request, "/admin/login?error=expired", {}, 403);
  const secret = getConfig().SESSION_SECRET;

  if (form.action === "logout") {
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = next(request, "/admin/login?ok=out");
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (!(await hit(`login:address:${clientAddress(request)}`, 15, 30))) {
    return next(request, "/admin/login?error=Locked", {}, 429);
  }

  if (form.action === "password") {
    const result = await checkPassword(form.email ?? "", form.password ?? "");
    if (!result.ok) return next(request, `/admin/login?error=${result.reason}`, {}, 401);
    const response = next(request, "/admin/login?step=code");
    const expires = new Date(Date.now() + PENDING_MS);
    setCookie(request, response, PENDING_COOKIE, signValue(secret, `${result.staffId}:${expires.getTime()}`), expires);
    return response;
  }

  if (form.action === "emailSend") {
    const address = (form.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(address)) return next(request, "/admin/login?step=email&error=Wrong", {}, 400);
    const sent = await sendEmailCode(address, toLocale(form.locale));
    if (!sent.ok)
      return next(request, `/admin/login?step=email&error=${sent.reason}`, {}, sent.reason === "Locked" ? 429 : 502);
    // The address rides in a signed cookie, so the code step needs only the code.
    const expires = new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60_000);
    const value = `${Buffer.from(address).toString("base64url")}:${expires.getTime()}`;
    const response = next(request, "/admin/login?step=emailcode&ok=sent");
    setCookie(request, response, EMAIL_PENDING_COOKIE, signValue(secret, value), expires);
    return response;
  }

  if (form.action === "emailCode") {
    const pending = verifySignedValue(secret, request.cookies.get(EMAIL_PENDING_COOKIE)?.value ?? "");
    const [encoded, expiresText] = (pending ?? "").split(":");
    if (!encoded || !expiresText || Number(expiresText) < Date.now()) {
      return next(request, "/admin/login?step=email&error=expired", {}, 401);
    }
    const address = Buffer.from(encoded, "base64url").toString();
    const staffId = await checkEmailCode(address, (form.code ?? "").replace(/\D/g, ""));
    if (!staffId) return next(request, "/admin/login?step=emailcode&error=Code", {}, 401);
    const session = await createSession(staffId, request.headers.get("user-agent"));
    const response = next(request, "/admin");
    response.cookies.delete(EMAIL_PENDING_COOKIE);
    setCookie(request, response, SESSION_COOKIE, session.raw, session.expiresAt);
    return response;
  }

  if (form.action === "code") {
    const pending = verifySignedValue(secret, request.cookies.get(PENDING_COOKIE)?.value ?? "");
    const [staffId, expiresMs] = (pending ?? "").split(":").map(Number);
    if (!staffId || !expiresMs || expiresMs < Date.now()) return next(request, "/admin/login?error=expired", {}, 401);
    if (!(await checkTotp(staffId, (form.code ?? "").replace(/\D/g, "")))) {
      return next(request, "/admin/login?step=code&error=Code", {}, 401);
    }
    const session = await createSession(staffId, request.headers.get("user-agent"));
    const response = next(request, "/admin");
    response.cookies.delete(PENDING_COOKIE);
    setCookie(request, response, SESSION_COOKIE, session.raw, session.expiresAt);
    return response;
  }
  return next(request, "/admin/login", {}, 400);
}
