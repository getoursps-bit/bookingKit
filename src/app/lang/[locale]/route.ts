import { type NextRequest, NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE, localePath } from "@/i18n/locales";
import { getConfig } from "@/core/platform/config";

export const dynamic = "force-dynamic";

/**
 * The language switch: remembers the choice and goes back to the same page in
 * that language. Public pages change address (/en/...); the owner area keeps its
 * address and follows the cookie. Only same-site paths are accepted as `back`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const raw = request.nextUrl.searchParams.get("back") ?? "/";
  const back = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/";
  const base = getConfig().APP_BASE_URL;
  if (!isLocale(locale)) return NextResponse.redirect(new URL(back, base), 303);
  const response = NextResponse.redirect(new URL(localePath(locale, back), base), 303);
  response.cookies.set(LOCALE_COOKIE, locale, {
    sameSite: "lax",
    secure: base.startsWith("https:"),
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
