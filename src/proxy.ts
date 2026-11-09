import { NextResponse, type NextRequest } from "next/server";
import { isLocalizedPath, LOCALE_COOKIE, LOCALE_HEADER, splitLocale } from "./i18n/locales";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_S, attributionFromUrl, encodeAttribution } from "./server/attribution";
import { contentSecurityPolicy, CSRF_COOKIE, newCsrfToken } from "./server/security";
import { SESSION_COOKIE, SESSION_DAYS } from "./server/staff/cookie";

/**
 * Runs before every page:
 * - a fresh nonce and the content security policy that allows only it;
 * - campaign tags from the first visit, in a signed cookie;
 * - the CSRF cookie that forms send back;
 * - the language: /en/... serves the same page in English, and the choice is
 *   kept in a cookie for form posts and the owner area (which has no prefix);
 * - the owner's session cookie, renewed for another 30 days on each admin
 *   page, as the session itself is in the database (a stale cookie is still
 *   refused there).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const secure = request.nextUrl.protocol === "https:";

  // Next.js reads the nonce from the request's policy header and adds it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const csrf = request.cookies.get(CSRF_COOKIE)?.value ?? newCsrfToken();
  if (!request.cookies.has(CSRF_COOKIE)) {
    // Pages rendered on this first request already see the token.
    const cookie = requestHeaders.get("cookie");
    requestHeaders.set("cookie", `${cookie ? `${cookie}; ` : ""}${CSRF_COOKIE}=${csrf}`);
  }

  // Public pages take their language from the address and remember it in the
  // cookie. Everything else (owner area, APIs, redirects) reads the cookie, so
  // the header is removed there: a visitor cannot set it themselves.
  const isPage = isLocalizedPath(request.nextUrl.pathname);
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  if (isPage) requestHeaders.set(LOCALE_HEADER, locale);
  else requestHeaders.delete(LOCALE_HEADER);
  const response =
    isPage && locale === "en"
      ? NextResponse.rewrite(new URL(path + request.nextUrl.search, request.url), { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // Only a page the visitor opens counts as a choice: the service worker's
  // offline copy, link prefetches and other background requests do not.
  const fetchMode = request.headers.get("sec-fetch-mode");
  const isVisit = (fetchMode === null || fetchMode === "navigate") && !request.headers.has("next-router-prefetch");
  if (isPage && isVisit && request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { sameSite: "lax", secure, path: "/", maxAge: 365 * 24 * 60 * 60 });
  }

  if (!request.cookies.has(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, csrf, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session && path.startsWith("/admin") && isVisit) {
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  }

  const secret = process.env.SESSION_SECRET;
  const tags = attributionFromUrl(request.nextUrl);
  if (secret && tags && !request.cookies.has(ATTRIBUTION_COOKIE)) {
    response.cookies.set(ATTRIBUTION_COOKIE, encodeAttribution(secret, tags), {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: ATTRIBUTION_MAX_AGE_S,
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not static files, images, the health check or API routes.
      source:
        "/((?!api|_next/static|_next/image|healthz|favicon.ico|robots.txt|sitemap.xml|sw.js|admin-sw.js|manifest.webmanifest|app-icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
