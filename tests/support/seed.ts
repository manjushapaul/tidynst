import { eq } from "drizzle-orm";
import { guideRevisions, guides, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { guideContentHash } from "@/lib/content/content-hash";
import type { GuideContent } from "@/lib/content/guide-schema";
import { guideContent } from "./fixtures";

let counter = 0;

export async function insertUser(
  db: Db,
  role: "owner" | "editor" | "author" = "owner",
  passwordHash = "unused",
) {
  counter += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${counter}@example.test`, name: `${role} ${counter}`, role, passwordHash })
    .returning();
  return user!;
}

/**
 * Low-level fixture: writes a guide with one revision and optionally points the published
 * revision at it. Used by public read tests; CMS tests go through the real workflow instead.
 */
export async function insertGuide(
  db: Db,
  userId: string,
  overrides: Partial<GuideContent> = {},
  options: { published?: boolean; publishedAt?: Date } = {},
) {
  const content = guideContent(overrides);
  const hash = guideContentHash(content);
  const [guide] = await db
    .insert(guides)
    .values({
      slug: content.slug,
      title: content.title,
      excerpt: content.excerpt,
      body: content.body,
      closing: content.closing,
      category: content.category,
      subcategoryId: content.subcategoryId,
      subcategoryGroupId: content.subcategoryGroupId,
      contentHash: hash,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  const [revision] = await db
    .insert(guideRevisions)
    .values({
      guideId: guide!.id,
      revisionNumber: 1,
      slug: content.slug,
      title: content.title,
      excerpt: content.excerpt,
      body: content.body,
      closing: content.closing,
      category: content.category,
      subcategoryId: content.subcategoryId,
      subcategoryGroupId: content.subcategoryGroupId,
      topicIds: content.topicIds,
      products: content.products,
      contentHash: hash,
      reason: "created",
      createdBy: userId,
    })
    .returning();
  const publishedAt = options.publishedAt ?? new Date();
  await db
    .update(guides)
    .set({
      currentRevisionId: revision!.id,
      ...(options.published
        ? { publishedRevisionId: revision!.id, publishedAt, firstPublishedAt: publishedAt }
        : {}),
    })
    .where(eq(guides.id, guide!.id));
  return { guide: guide!, revision: revision! };
}
