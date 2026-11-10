import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CSRF_COOKIE } from "../security";
import { resolveSession, SESSION_COOKIE, type Staff } from "./auth";

/** For admin pages: the signed-in staff member and the CSRF token, or a redirect to the login. */
export async function requireStaffPage(): Promise<{ staff: Staff; csrf: string }> {
  const jar = await cookies();
  const staff = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (!staff) redirect("/admin/login");
  return { staff, csrf: jar.get(CSRF_COOKIE)?.value ?? "" };
}
