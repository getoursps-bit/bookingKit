import { NextResponse, type NextRequest } from "next/server";
import { csrfOk, next, readFormWithFiles } from "../../booking/http";
import { resolveSession, SESSION_COOKIE, type Staff } from "./auth";

/**
 * The common start of every admin API route: a live session, the CSRF token
 * and the form with any files. On failure it returns the response to send instead.
 */
export async function adminRequest(
  request: NextRequest,
): Promise<
  { ok: true; staff: Staff; form: Record<string, string>; files: Record<string, File[]> } | { ok: false; response: NextResponse }
> {
  const staff = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!staff) return { ok: false, response: next(request, "/admin/login", { error: "Login" }, 401) };
  const { form, files } = await readFormWithFiles(request);
  if (!csrfOk(request, form)) return { ok: false, response: next(request, "/admin?error=expired", {}, 403) };
  return { ok: true, staff, form, files };
}

/** Back to an admin page with a short notice key (`?ok=` or `?error=`) for the page to show. */
export function backTo(request: NextRequest, path: string, notice: { ok?: string; error?: string } = {}, status?: number) {
  const url = new URL(path, "http://x");
  if (notice.ok) url.searchParams.set("ok", notice.ok);
  if (notice.error) url.searchParams.set("error", notice.error);
  return next(request, url.pathname + url.search, notice, status ?? (notice.error ? 400 : 200));
}
