import { type Db, getPool, query } from "./db";

export type AuditEntry = {
  staffId?: number | null;
  actor: "staff" | "customer" | "system" | "import";
  entity: string;
  entityId?: string | number | null;
  action: string;
  before?: unknown;
  after?: unknown;
};

/** Records who changed what. Call inside the same transaction as the change. */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await query(
    `insert into audit_log (staff_id, actor, entity, entity_id, action, before, after)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.staffId ?? null,
      entry.actor,
      entry.entity,
      entry.entityId == null ? null : String(entry.entityId),
      entry.action,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
    db,
  );
}

/** Records something a staff member did that is not part of a transaction (an export, say). */
export async function auditStaff(staffId: number, entry: Omit<AuditEntry, "staffId" | "actor">): Promise<void> {
  await writeAudit(getPool(), { ...entry, staffId, actor: "staff" });
}
