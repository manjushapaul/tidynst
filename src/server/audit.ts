import "server-only";
import { auditEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import type { AuditAction } from "@/lib/audit-actions";

export type { AuditAction } from "@/lib/audit-actions";

export async function audit(
  db: Db,
  event: {
    actorId: string | null;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    details: event.details ?? {},
  });
}
