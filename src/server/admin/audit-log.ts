import "server-only";
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { auditEvents, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditEntityType,
  isAuditAction,
} from "@/lib/audit-actions";
import { type Actor, assertCan, can } from "@/server/auth/permissions";

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_PAGE_MAX = 2_000;

export type AuditQuery = {
  action?: AuditAction;
  actorId?: string;
  entityType?: AuditEntityType;
  /** Only honoured together with `entityType`. */
  entityId?: string;
  from?: string;
  to?: string;
  page: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normaliseAuditQuery(raw: Record<string, string | string[] | undefined>): AuditQuery {
  const one = (key: string) => {
    const value = raw[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const action = one("action");
  const actorId = one("actorId");
  const entityType = one("entityType");
  const entityId = one("entityId");
  const from = one("from");
  const to = one("to");
  const page = one("page");
  const validType = (AUDIT_ENTITY_TYPES as readonly string[]).includes(entityType);
  return {
    ...(isAuditAction(action) ? { action } : {}),
    ...(UUID.test(actorId) ? { actorId } : {}),
    ...(validType ? { entityType: entityType as AuditEntityType } : {}),
    ...(validType && UUID.test(entityId) ? { entityId: entityId.toLowerCase() } : {}),
    ...(isDate(from) ? { from } : {}),
    ...(isDate(to) ? { to } : {}),
    page: /^[1-9]\d{0,3}$/.test(page) ? Math.min(AUDIT_PAGE_MAX, Number(page)) : 1,
  };
}

/** Start of a calendar day in India (UTC+05:30, no daylight saving). */
function startOfIndianDay(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

/**
 * Detail keys that may be shown. Everything else stays in the database: details can never leak
 * passwords, tokens, hashes of secrets, IP addresses or user agents into the page.
 */
const SAFE_DETAIL_KEYS: Record<string, string> = {
  revisionNumber: "Revision",
  version: "Version",
  from: "From",
  to: "To",
  role: "Role",
  status: "Status",
  slug: "Address",
  reason: "Reason",
  selfApproved: "Self-approved",
  firstPublication: "First publication",
  publishedArticles: "Published articles affected",
  changedFields: "Changed fields",
  readerVisibleFields: "Reader-visible fields changed",
  impactConfirmed: "Impact confirmed",
  serverVersion: "Server version",
  filename: "File",
  contentHash: "Content hash",
};

export type AuditDetail = { label: string; value: string };

export function safeAuditDetails(details: unknown): AuditDetail[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const result: AuditDetail[] = [];
  for (const [key, label] of Object.entries(SAFE_DETAIL_KEYS)) {
    const value = (details as Record<string, unknown>)[key];
    let text: string;
    if (typeof value === "string" && value !== "") {
      text = key === "contentHash" ? `${value.slice(0, 12)}…` : value;
    } else if (typeof value === "number") text = String(value);
    else if (typeof value === "boolean") text = value ? "yes" : "no";
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) text = value.join(", ");
    else continue;
    result.push({ label, value: text.length > 200 ? `${text.slice(0, 200)}…` : text });
  }
  return result;
}

export type AuditRow = {
  id: number;
  createdAt: Date;
  action: string;
  actorId: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  details: AuditDetail[];
};

export async function listAuditEvents(
  db: Db,
  actor: Actor,
  query: AuditQuery,
): Promise<{
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  actors: Array<{ id: string; name: string }>;
}> {
  assertCan(actor, "audit.view");
  const conditions: SQL[] = [];
  if (query.action) conditions.push(eq(auditEvents.action, query.action));
  if (query.actorId) conditions.push(eq(auditEvents.actorId, query.actorId));
  if (query.entityType) {
    conditions.push(eq(auditEvents.entityType, query.entityType));
    if (query.entityId) conditions.push(eq(auditEvents.entityId, query.entityId));
  }
  if (query.from) conditions.push(gte(auditEvents.createdAt, startOfIndianDay(query.from)));
  if (query.to) {
    const end = startOfIndianDay(query.to);
    end.setUTCDate(end.getUTCDate() + 1);
    conditions.push(lt(auditEvents.createdAt, end));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [countRow, rows, actors] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(where),
    db
      .select({
        id: auditEvents.id,
        createdAt: auditEvents.createdAt,
        action: auditEvents.action,
        actorId: auditEvents.actorId,
        actorName: users.name,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        details: auditEvents.details,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(where)
      .orderBy(desc(auditEvents.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((query.page - 1) * AUDIT_PAGE_SIZE),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)).limit(200),
  ]);
  return {
    items: rows.map((row) => ({ ...row, id: Number(row.id), details: safeAuditDetails(row.details) })),
    total: countRow[0]?.n ?? 0,
    page: query.page,
    pageSize: AUDIT_PAGE_SIZE,
    actors,
  };
}

/** Admin link for an audited entity, or null when there is nothing to open (or it is not viewable). */
export function auditEntityHref(
  actor: Actor,
  entityType: string | null,
  entityId: string | null,
): string | null {
  if (entityType === "site" && can(actor, "site.manage")) return "/admin/homepage";
  if (!entityType || !entityId || !UUID.test(entityId)) return null;
  if (entityType === "guide" && can(actor, "guide.editAny")) return `/admin/guides/${entityId}`;
  if (entityType === "topic" && can(actor, "topic.manage")) return "/admin/topics";
  if (entityType === "product" && can(actor, "product.manage")) return `/admin/products/${entityId}`;
  if (entityType === "user" && can(actor, "user.manage")) return "/admin/users";
  if (entityType === "media") return "/admin/media";
  if (entityType === "message" && can(actor, "message.manage")) return `/admin/messages/${entityId}`;
  return null;
}
