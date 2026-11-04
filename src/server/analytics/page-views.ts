import "server-only";
import { desc, sql } from "drizzle-orm";
import { pageViews } from "@/db/schema";
import type { Db } from "@/db/types";
import { analyticsDay, normalisePagePath, shiftDay } from "@/lib/analytics/page-path";
import { can, type Actor } from "@/server/auth/permissions";

export type PageViewRow = {
  path: string;
  views30: number;
  viewsAll: number;
  lastDay: string;
};

export type PageViewReport = {
  today: number;
  last7Days: number;
  last30Days: number;
  allTime: number;
  pages: PageViewRow[];
};

/** Counts one public page open. Repeated opens of the same path on the same day add up. */
export async function recordPageView(db: Db, path: string, now = new Date()): Promise<boolean> {
  const normalised = normalisePagePath(path);
  if (!normalised) return false;
  const day = analyticsDay(now);
  await db
    .insert(pageViews)
    .values({ path: normalised, day, views: 1 })
    .onConflictDoUpdate({
      target: [pageViews.path, pageViews.day],
      set: { views: sql`${pageViews.views} + 1` },
    });
  return true;
}

/** Site-wide page totals. Null when the actor cannot see traffic. */
export async function pageViewReport(db: Db, actor: Actor, now = new Date()): Promise<PageViewReport | null> {
  if (!can(actor, "analytics.view")) return null;
  const today = analyticsDay(now);
  const since7 = shiftDay(today, -6);
  const since30 = shiftDay(today, -29);

  const [totals, pages] = await Promise.all([
    db
      .select({
        allTime: sql<number>`coalesce(sum(${pageViews.views}), 0)::int`,
        last30Days: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${since30}), 0)::int`,
        last7Days: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${since7}), 0)::int`,
        today: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} = ${today}), 0)::int`,
      })
      .from(pageViews),
    db
      .select({
        path: pageViews.path,
        viewsAll: sql<number>`sum(${pageViews.views})::int`,
        views30: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${since30}), 0)::int`,
        lastDay: sql<string>`max(${pageViews.day})::text`,
      })
      .from(pageViews)
      .groupBy(pageViews.path)
      .orderBy(
        desc(sql`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${since30}), 0)`),
        desc(sql`sum(${pageViews.views})`),
        pageViews.path,
      )
      .limit(100),
  ]);

  const row = totals[0];
  return {
    today: row?.today ?? 0,
    last7Days: row?.last7Days ?? 0,
    last30Days: row?.last30Days ?? 0,
    allTime: row?.allTime ?? 0,
    pages: pages.map((page) => ({
      path: page.path,
      views30: page.views30,
      viewsAll: page.viewsAll,
      lastDay: page.lastDay,
    })),
  };
}
