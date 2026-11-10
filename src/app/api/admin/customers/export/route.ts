import { NextResponse, type NextRequest } from "next/server";
import { auditStaff } from "@/core/platform/audit";
import { exportAll } from "@/core/booking/customers";
import { resolveSession, SESSION_COOKIE } from "@/core/platform/staff/auth";

export const dynamic = "force-dynamic";

/** `GET ?id=`: everything held about one customer, as a JSON download, for a data access request. */
export async function GET(request: NextRequest) {
  const staff = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "Login" }, { status: 401 });
  const id = Number(request.nextUrl.searchParams.get("id"));
  const data = Number.isInteger(id) ? await exportAll(id) : null;
  if (!data) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  await auditStaff(staff.id, { entity: "customers", entityId: id, action: "export" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
