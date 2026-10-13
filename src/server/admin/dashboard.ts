import "server-only";
import { and, count, desc, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { auditEvents, guides, mediaAssets, products, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { type Actor, can } from "@/server/auth/permissions";

export type DashboardStats = {
  scope: "all" | "own";
  guides: { total: number; drafts: number; published: number; unpublishedChanges: number };
  review: { inReview: number; changesRequested: number; approvedNotPublished: number };
  products: { active: number; total: number } | null;
  media: number;
  users: { active: number; disabled: number } | null;
};

async function countWhere(db: Db, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ n: count() }).from(guides).where(where);
  return row?.n ?? 0;
}

/** Real counts from the database. Authors only see counts for guides they created. */
export async function dashboardStats(db: Db, actor: Actor): Promise<DashboardStats> {
  const own = can(actor, "guide.editAny") ? undefined : eq(guides.createdBy, actor.id);
  const scoped = (condition?: SQL) => (own && condition ? and(own, condition) : (own ?? condition));

  const [total, drafts, published, unpublishedChanges, inReview, changesRequested, approvedNotPublished] =
    await Promise.all([
      countWhere(db, scoped()),
      countWhere(db, scoped(isNull(guides.publishedRevisionId))),
      countWhere(db, scoped(isNotNull(guides.publishedRevisionId))),
      countWhere(
        db,
        scoped(
          and(
            isNotNull(guides.publishedRevisionId),
            sql`${guides.currentRevisionId} is distinct from ${guides.publishedRevisionId}`,
          ),
        ),
      ),
      countWhere(db, scoped(eq(guides.reviewState, "in_review"))),
      countWhere(db, scoped(eq(guides.reviewState, "changes_requested"))),
      countWhere(
        db,
        scoped(
          and(
            eq(guides.reviewState, "approved"),
            sql`${guides.currentRevisionId} is distinct from ${guides.publishedRevisionId}`,
          ),
        ),
      ),
    ]);

  const [productRows, mediaRows, userRows] = await Promise.all([
    can(actor, "product.manage")
      ? db.select({ status: products.status, n: count() }).from(products).groupBy(products.status)
      : Promise.resolve(null),
    db.select({ n: count() }).from(mediaAssets),
    can(actor, "user.manage")
      ? db
          .select({ disabled: sql<boolean>`${users.disabledAt} is not null`, n: count() })
          .from(users)
          .groupBy(sql`${users.disabledAt} is not null`)
      : Promise.resolve(null),
  ]);

  return {
    scope: own ? "own" : "all",
    guides: { total, drafts, published, unpublishedChanges },
    review: { inReview, changesRequested, approvedNotPublished },
    products: productRows
      ? {
          active: productRows.find((row) => row.status === "active")?.n ?? 0,
          total: productRows.reduce((sum, row) => sum + row.n, 0),
        }
      : null,
    media: mediaRows[0]?.n ?? 0,
    users: userRows
      ? {
          active: userRows.find((row) => !row.disabled)?.n ?? 0,
          disabled: userRows.find((row) => row.disabled)?.n ?? 0,
        }
      : null,
  };
}

export async function recentActivity(db: Db, actor: Actor, limit = 8) {
  if (!can(actor, "audit.view")) return null;
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .orderBy(desc(auditEvents.id))
    .limit(limit);
}
