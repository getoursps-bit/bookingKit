import type { NextRequest } from "next/server";
import { erase, getCustomer, merge, setNotes } from "@/core/booking/customers";
import { auditStaff } from "@/core/platform/audit";
import { adminRequest, backTo } from "@/core/platform/staff/http";

export const dynamic = "force-dynamic";

/** Notes, merging two records, and erasing personal data on request. Each is audited. */
export async function POST(request: NextRequest) {
  const req = await adminRequest(request);
  if (!req.ok) return req.response;
  const { form, staff } = req;
  const id = Number(form.id);
  const customer = Number.isInteger(id) ? await getCustomer(id) : null;
  if (!customer || customer.erasedAt) return backTo(request, "/admin/customers", { error: "NotFound" });
  const back = `/admin/customers/${id}`;

  switch (form.action) {
    case "notes": {
      const notes = form.notes?.trim().slice(0, 2000) || null;
      await setNotes(id, notes, staff.id);
      return backTo(request, back, { ok: "saved" });
    }
    case "merge": {
      const dropId = Number(form.dropId);
      const drop = Number.isInteger(dropId) && dropId !== id ? await getCustomer(dropId) : null;
      if (!drop || drop.erasedAt) return backTo(request, back, { error: "NotFound" });
      await merge(id, dropId);
      await auditStaff(staff.id, { entity: "customers", entityId: id, action: "merge", before: { dropped: dropId } });
      return backTo(request, back, { ok: "customers.merged" });
    }
    case "erase": {
      if (form.confirm !== "on") return backTo(request, back, { error: "invalid" });
      await erase(id);
      await auditStaff(staff.id, { entity: "customers", entityId: id, action: "erase" });
      return backTo(request, "/admin/customers", { ok: "customers.erased" });
    }
    default:
      return backTo(request, back, { error: "invalid" });
  }
}
