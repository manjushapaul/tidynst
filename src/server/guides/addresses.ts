import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { guideRevisions, guides } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Addresses can change after publication, so a working-copy slug being unique is not enough: another
 * article's live revision may still use the address until that article is published again.
 */
export async function liveAddressTaken(tx: Db, guideId: string | null, slug: string): Promise<boolean> {
  const [taken] = await tx
    .select({ id: guides.id })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .where(and(eq(guideRevisions.slug, slug), guideId ? ne(guides.id, guideId) : undefined))
    .limit(1);
  return Boolean(taken);
}

/** Serialises publications of the same address until the transaction ends. */
export async function lockAddress(tx: Db, slug: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guide-address:${slug}`}))`);
}
