import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { rateLimitEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { sha256 } from "./tokens";

export type RateLimitRule = { key: string; limit: number; windowMs: number };

/** Bucket names are hashed so raw emails and IP addresses are never stored. */
export function bucketFor(key: string): string {
  return sha256(`rate-limit:${key}`);
}

export const LOGIN_LIMITS = {
  perAccount: { limit: 5, windowMs: 15 * 60_000 },
  perIp: { limit: 30, windowMs: 15 * 60_000 },
} as const;

async function countRecent(db: Db, bucket: string, windowMs: number, now: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rateLimitEvents)
    .where(
      and(
        eq(rateLimitEvents.bucket, bucket),
        gte(rateLimitEvents.createdAt, new Date(now.getTime() - windowMs)),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Returns true if any rule's bucket already holds `limit` events inside its window. Runs inside the
 * caller's transaction with an advisory lock per bucket, so concurrent requests cannot both slip
 * under the limit.
 */
export async function isRateLimited(
  db: Db,
  rules: readonly RateLimitRule[],
  now = new Date(),
): Promise<boolean> {
  for (const rule of rules) {
    const bucket = bucketFor(rule.key);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${bucket}))`);
    if ((await countRecent(db, bucket, rule.windowMs, now)) >= rule.limit) return true;
  }
  return false;
}

export async function recordEvent(db: Db, key: string, now = new Date()): Promise<void> {
  await db.insert(rateLimitEvents).values({ bucket: bucketFor(key), createdAt: now });
}

export async function clearBucket(db: Db, key: string): Promise<void> {
  await db.delete(rateLimitEvents).where(eq(rateLimitEvents.bucket, bucketFor(key)));
}

export async function purgeOldEvents(
  db: Db,
  olderThanMs = 24 * 60 * 60_000,
  now = new Date(),
): Promise<void> {
  await db
    .delete(rateLimitEvents)
    .where(lt(rateLimitEvents.createdAt, new Date(now.getTime() - olderThanMs)));
}
