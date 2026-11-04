import "server-only";
import { eq, ilike, or } from "drizzle-orm";
import { guideRevisions, guides, homepageSettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { HOMEPAGE_ID, homepageMediaIds, type HomepageContent } from "@/lib/content/homepage-schema";
import { bodyMediaIds } from "@/lib/content/publish-rules";

/** Readers and shared caches may keep a published image this long after it stops being public. */
export const PUBLIC_MEDIA_MAX_AGE = 300;

const VISIBILITY_TTL_MS = 30_000;
const VISIBILITY_MAX_ENTRIES = 2_000;

type VisibilityCache = Map<string, { visible: boolean; expires: number }>;

const store = globalThis as typeof globalThis & { __tidynestMediaVisibility?: VisibilityCache };

function visibilityCache(): VisibilityCache {
  store.__tidynestMediaVisibility ??= new Map();
  return store.__tidynestMediaVisibility;
}

/** Drops cached answers. Called after publishing or unpublishing commits in this process. */
export function forgetMediaVisibility(): void {
  visibilityCache().clear();
}

/**
 * Whether a library asset is referenced by a currently published revision: as its featured image,
 * or as a `/media/<id>/…` image or link in its body. Answers are cached per process for 30 seconds
 * (cleared on publish and unpublish), so a page of images costs at most one query per image.
 */
export async function isPublishedMedia(db: Db, mediaId: string, now = Date.now()): Promise<boolean> {
  const id = mediaId.toLowerCase();
  const cache = visibilityCache();
  const cached = cache.get(id);
  if (cached && cached.expires > now) return cached.visible;

  const rows = await db
    .select({ featuredImageId: guideRevisions.featuredImageId, body: guideRevisions.body })
    .from(guides)
    .innerJoin(guideRevisions, eq(guideRevisions.id, guides.publishedRevisionId))
    .where(or(eq(guideRevisions.featuredImageId, id), ilike(guideRevisions.body, `%/media/${id}/%`)));
  let visible = rows.some(
    (row) => row.featuredImageId?.toLowerCase() === id || bodyMediaIds(row.body).includes(id),
  );
  if (!visible) {
    const [home] = await db
      .select({ content: homepageSettings.content })
      .from(homepageSettings)
      .where(eq(homepageSettings.id, HOMEPAGE_ID))
      .limit(1);
    visible = home ? homepageMediaIds(home.content as HomepageContent).includes(id) : false;
  }

  if (cache.size >= VISIBILITY_MAX_ENTRIES) cache.clear();
  cache.set(id, { visible, expires: now + VISIBILITY_TTL_MS });
  return visible;
}
