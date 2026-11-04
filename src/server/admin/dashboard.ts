import "server-only";
import { access, constants, statfs } from "node:fs/promises";
import { and, count, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
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

export type StorageOverview = {
  /** Total size of this Postgres database, including images, revisions and indexes. */
  databaseBytes: number;
  /** Sum of uploaded image file sizes (what each upload contributes). */
  mediaBytes: number;
  mediaFiles: number;
  /** Free space on the volume that holds the database files, when this host can see it. */
  disk: { freeBytes: number; totalBytes: number } | null;
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

async function diskForDataDirectory(dataDirectory: string | null): Promise<StorageOverview["disk"]> {
  if (!dataDirectory || !dataDirectory.startsWith("/")) return null;
  try {
    await access(dataDirectory, constants.R_OK);
    const stats = await statfs(dataDirectory);
    const block = Number(stats.bsize);
    return {
      freeBytes: Number(stats.bavail) * block,
      totalBytes: Number(stats.blocks) * block,
    };
  } catch {
    // Hosted Postgres (or a path this app process cannot read): only DB figures are available.
    return null;
  }
}

/** Database size, image library size, and free disk when the data directory is local. */
export async function storageOverview(db: Db): Promise<StorageOverview> {
  const [sizeResult, [mediaRow]] = await Promise.all([
    db.execute(sql`
      select
        pg_database_size(current_database()) as database_bytes,
        current_setting('data_directory', true) as data_directory
    `),
    db
      .select({
        mediaBytes: sql<string | number>`coalesce(sum(${mediaAssets.byteSize}), 0)`,
        mediaFiles: count(),
      })
      .from(mediaAssets),
  ]);

  const sizeRow = (
    sizeResult as { rows: Array<{ database_bytes: string | number; data_directory: string | null }> }
  ).rows[0];
  const databaseBytes = Number(sizeRow?.database_bytes ?? 0);
  const mediaBytes = Number(mediaRow?.mediaBytes ?? 0);
  const mediaFiles = Number(mediaRow?.mediaFiles ?? 0);
  const disk = await diskForDataDirectory(sizeRow?.data_directory ?? null);

  return { databaseBytes, mediaBytes, mediaFiles, disk };
}
