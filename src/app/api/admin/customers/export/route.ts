import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db";
import { writeAudit } from "@/server/repos/audit";
import { exportAll } from "@/server/repos/customers";
import { resolveSession, SESSION_COOKIE } from "@/server/staff/auth";

export const dynamic = "force-dynamic";

/** `GET ?id=`: everything held about one customer, as a JSON download, for a data access request. */
export async function GET(request: NextRequest) {
  const staff = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "Login" }, { status: 401 });
  const id = Number(request.nextUrl.searchParams.get("id"));
  const data = Number.isInteger(id) ? await exportAll(id) : null;
  if (!data) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  await writeAudit(getPool(), { staffId: staff.id, actor: "staff", entity: "customers", entityId: id, action: "export" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
