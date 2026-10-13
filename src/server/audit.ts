import "server-only";
import { auditEvents } from "@/db/schema";
import type { Db } from "@/db/types";

export type AuditAction =
  | "auth.login_succeeded"
  | "auth.login_failed"
  | "auth.login_rate_limited"
  | "auth.logout"
  | "auth.session_revoked"
  | "auth.password_changed"
  | "user.owner_created"
  | "user.created"
  | "user.role_changed"
  | "user.disabled"
  | "user.enabled"
  | "guide.created"
  | "guide.saved"
  | "guide.restored"
  | "guide.deleted"
  | "guide.review_requested"
  | "guide.review_approved"
  | "guide.review_changes_requested"
  | "guide.review_invalidated"
  | "guide.published"
  | "guide.unpublished"
  | "guide.save_conflict"
  | "product.created"
  | "product.updated"
  | "media.uploaded"
  | "media.deleted";

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
