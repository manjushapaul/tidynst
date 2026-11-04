import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  guideProducts,
  guideRevisions,
  guides,
  guideTopics,
  mediaAssets,
  products,
  subcategories,
  subcategoryGroups,
  topics,
  type GuideFaq,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { ArticleImageStyle } from "@/lib/content/article-image-style";
import type { FeaturedImageStyle } from "@/lib/content/featured-image-style";
import { guideContentHash } from "@/lib/content/content-hash";
import { fieldErrorsFrom, guideContentSchema, type GuideContent } from "@/lib/content/guide-schema";
import type { CategorySlug } from "@/content/categories";
import { audit } from "@/server/audit";
import { can, canEditGuide, type Actor, AuthorizationError } from "@/server/auth/permissions";
import { UserInputError } from "@/server/users";
import { isUniqueViolation } from "@/server/pg-error";
import { liveAddressTaken } from "./addresses";
import { GuideFormError, SaveConflictError } from "./errors";

/**
 * Lock order for guide writes: the guide row (`FOR UPDATE`) first, then the featured media row
 * (`FOR SHARE`). Media deletion locks only the media row (`FOR UPDATE`) and does not lock guides,
 * so the two operations cannot deadlock.
 */

function parseContent(raw: unknown): GuideContent {
  const parsed = guideContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GuideFormError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      fieldErrorsFrom(parsed.error),
    );
  }
  return parsed.data;
}

async function assertReferences(tx: Db, content: GuideContent): Promise<void> {
  if (content.topicIds.length > 0) {
    const rows = await tx.select({ id: topics.id }).from(topics).where(inArray(topics.id, content.topicIds));
    if (rows.length !== content.topicIds.length) {
      throw new GuideFormError("One of the selected topics does not exist.", {
        topicIds: "Choose topics from the list.",
      });
    }
  }
  if (content.products.length > 0) {
    const ids = content.products.map((item) => item.productId);
    const rows = await tx.select({ id: products.id }).from(products).where(inArray(products.id, ids));
    if (rows.length !== ids.length) {
      throw new GuideFormError("One of the selected products does not exist.", {
        products: "Choose products from the list.",
      });
    }
  }
  if (content.subcategoryGroupId) {
    const [group] = await tx
      .select({ category: subcategoryGroups.category })
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.id, content.subcategoryGroupId))
      .limit(1);
    if (!group || group.category !== content.category) {
      throw new GuideFormError("Choose a subcategory from this category.", {
        subcategoryGroupId: "Choose a subcategory from this category.",
      });
    }
  }
  if (content.subcategoryId) {
    const [subcategory] = await tx
      .select({ category: subcategories.category, groupId: subcategories.groupId })
      .from(subcategories)
      .where(eq(subcategories.id, content.subcategoryId))
      .limit(1);
    if (
      !subcategory ||
      subcategory.category !== content.category ||
      (content.subcategoryGroupId && subcategory.groupId !== content.subcategoryGroupId)
    ) {
      throw new GuideFormError("Choose a topic from this subcategory.", {
        subcategoryId: "Choose a topic from this subcategory.",
      });
    }
  }
  if (content.featuredImageId) {
    const [asset] = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, content.featuredImageId))
      .for("share");
    if (!asset) {
      throw new GuideFormError("Choose a featured image from the library.", {
        featuredImageId: "That image is not in the library.",
      });
    }
  }
}

async function replaceAssociations(tx: Db, guideId: string, content: GuideContent): Promise<void> {
  await tx.delete(guideTopics).where(eq(guideTopics.guideId, guideId));
  await tx.delete(guideProducts).where(eq(guideProducts.guideId, guideId));
  if (content.topicIds.length > 0) {
    await tx.insert(guideTopics).values(content.topicIds.map((topicId) => ({ guideId, topicId })));
  }
  if (content.products.length > 0) {
    await tx.insert(guideProducts).values(
      content.products.map((item, position) => ({
        guideId,
        productId: item.productId,
        position,
        note: item.note,
      })),
    );
  }
}

function contentColumns(content: {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  closing: string;
  category: CategorySlug | null;
  subcategoryId: string | null;
  subcategoryGroupId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageId: string | null;
  featuredImageAlt: string | null;
  featuredImageStyle: Partial<FeaturedImageStyle>;
  faqs: GuideFaq[];
  articleImageStyle: Partial<ArticleImageStyle>;
}) {
  return {
    slug: content.slug,
    title: content.title,
    excerpt: content.excerpt,
    body: content.body,
    closing: content.closing,
    category: content.category,
    subcategoryId: content.subcategoryId,
    subcategoryGroupId: content.subcategoryGroupId,
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    featuredImageId: content.featuredImageId,
    featuredImageAlt: content.featuredImageAlt,
    featuredImageStyle: content.featuredImageStyle,
    faqs: content.faqs,
    articleImageStyle: content.articleImageStyle,
  };
}

async function nextRevisionNumber(tx: Db, guideId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`coalesce(max(${guideRevisions.revisionNumber}), 0)::int` })
    .from(guideRevisions)
    .where(eq(guideRevisions.guideId, guideId));
  return (row?.n ?? 0) + 1;
}

async function insertRevision(
  tx: Db,
  input: {
    guideId: string;
    number: number;
    content: GuideContent;
    hash: string;
    reason: "created" | "saved" | "restored";
    actorId: string;
    restoredFromRevisionId?: string | null;
  },
) {
  const [revision] = await tx
    .insert(guideRevisions)
    .values({
      guideId: input.guideId,
      revisionNumber: input.number,
      ...contentColumns(input.content),
      topicIds: input.content.topicIds,
      products: input.content.products,
      contentHash: input.hash,
      reason: input.reason,
      restoredFromRevisionId: input.restoredFromRevisionId ?? null,
      createdBy: input.actorId,
    })
    .returning({ id: guideRevisions.id, revisionNumber: guideRevisions.revisionNumber });
  if (!revision) throw new Error("Revision insert returned no row.");
  return revision;
}

function slugConflict(): GuideFormError {
  return new GuideFormError("That address is already in use. Choose a different one.", {
    slug: "That address is already in use.",
  });
}

async function assertSlugNotReserved(tx: Db, slug: string) {
  const [reserved] = await tx
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(eq(subcategories.slug, slug))
    .limit(1);
  if (reserved) {
    throw new GuideFormError("That address is already used by a subcategory. Choose a different one.", {
      slug: "That address is already used by a subcategory.",
    });
  }
  const [group] = await tx
    .select({ id: subcategoryGroups.id })
    .from(subcategoryGroups)
    .where(eq(subcategoryGroups.slug, slug))
    .limit(1);
  if (group) {
    throw new GuideFormError("That address is already used by a subcategory. Choose a different one.", {
      slug: "That address is already used by a subcategory.",
    });
  }
}

async function assertEditor(tx: Db, actor: Actor, guideId: string) {
  if (!can(actor, "guide.editAny") && !can(actor, "guide.editOwn")) throw new AuthorizationError();
  const [guide] = await tx.select().from(guides).where(eq(guides.id, guideId)).for("update");
  if (!guide || !canEditGuide(actor, guide)) throw new UserInputError("Article not found.");
  return guide;
}

type ReviewState = (typeof guides.$inferSelect)["reviewState"];

/**
 * Approvals and pending submissions refer to one exact revision. Any new revision makes them
 * stale, so the article must be submitted and reviewed again. Requested changes stay visible
 * until the author resubmits.
 */
function reviewReset(state: ReviewState) {
  return state === "approved" || state === "in_review"
    ? { reviewState: "not_requested" as const, approvedContentHash: null }
    : null;
}

async function auditInvalidation(
  tx: Db,
  actorId: string,
  guideId: string,
  from: ReviewState,
  version: number,
) {
  await audit(tx, {
    actorId,
    action: "guide.review_invalidated",
    entityType: "guide",
    entityId: guideId,
    details: { from, version },
  });
}

export async function createGuide(
  db: Db,
  actor: Actor,
  raw: unknown,
): Promise<{ id: string; version: number }> {
  if (!can(actor, "guide.create")) throw new AuthorizationError();
  const content = parseContent(raw);
  const hash = guideContentHash(content);
  try {
    return await db.transaction(async (tx) => {
      await assertReferences(tx, content);
      if (await liveAddressTaken(tx, null, content.slug)) throw slugConflict();
      await assertSlugNotReserved(tx, content.slug);
      let guideId: string;
      try {
        const [guide] = await tx
          .insert(guides)
          .values({
            ...contentColumns(content),
            contentHash: hash,
            version: 1,
            reviewState: "not_requested",
            createdBy: actor.id,
            updatedBy: actor.id,
          })
          .returning({ id: guides.id });
        if (!guide) throw new Error("Guide insert returned no row.");
        guideId = guide.id;
      } catch (error) {
        if (isUniqueViolation(error, "guides_slug_key")) throw slugConflict();
        throw error;
      }
      await replaceAssociations(tx, guideId, content);
      const revision = await insertRevision(tx, {
        guideId,
        number: 1,
        content,
        hash,
        reason: "created",
        actorId: actor.id,
      });
      await tx.update(guides).set({ currentRevisionId: revision.id }).where(eq(guides.id, guideId));
      await audit(tx, {
        actorId: actor.id,
        action: "guide.created",
        entityType: "guide",
        entityId: guideId,
        details: { revisionId: revision.id, revisionNumber: 1 },
      });
      return { id: guideId, version: 1 };
    });
  } catch (error) {
    if (isUniqueViolation(error, "guides_slug_key")) throw slugConflict();
    throw error;
  }
}

export type SaveResult = { id: string; version: number; changed: boolean; content: GuideContent };

export async function saveGuide(
  db: Db,
  actor: Actor,
  guideId: string,
  expectedVersion: number,
  raw: unknown,
): Promise<SaveResult> {
  const content = parseContent(raw);
  try {
    return await db.transaction(async (tx) => {
      const guide = await assertEditor(tx, actor, guideId);
      if (guide.version !== expectedVersion) throw new SaveConflictError(guideId, content, guide.version);
      const hash = guideContentHash(content);
      if (hash === guide.contentHash) {
        return { id: guide.id, version: guide.version, changed: false, content };
      }
      await assertReferences(tx, content);
      if (await liveAddressTaken(tx, guide.id, content.slug)) throw slugConflict();
      await assertSlugNotReserved(tx, content.slug);
      const number = await nextRevisionNumber(tx, guide.id);
      const revision = await insertRevision(tx, {
        guideId: guide.id,
        number,
        content,
        hash,
        reason: "saved",
        actorId: actor.id,
      });
      const reset = reviewReset(guide.reviewState);
      const nextVersion = guide.version + 1;
      await replaceAssociations(tx, guide.id, content);
      await tx
        .update(guides)
        .set({
          ...contentColumns(content),
          contentHash: hash,
          version: nextVersion,
          currentRevisionId: revision.id,
          updatedBy: actor.id,
          updatedAt: new Date(),
          ...reset,
        })
        .where(and(eq(guides.id, guide.id), eq(guides.version, expectedVersion)));
      await audit(tx, {
        actorId: actor.id,
        action: "guide.saved",
        entityType: "guide",
        entityId: guide.id,
        details: { revisionId: revision.id, revisionNumber: number, version: nextVersion },
      });
      if (reset) await auditInvalidation(tx, actor.id, guide.id, guide.reviewState, nextVersion);
      return { id: guide.id, version: nextVersion, changed: true, content };
    });
  } catch (error) {
    if (error instanceof SaveConflictError) {
      await recordConflict(db, actor.id, error);
      throw error;
    }
    if (isUniqueViolation(error, "guides_slug_key")) throw slugConflict();
    throw error;
  }
}

/**
 * Writes the conflict audit outside the rolled-back save. A failed audit is logged and does not
 * turn the conflict into a success; the caller still receives SaveConflictError.
 */
async function recordConflict(db: Db, actorId: string, error: SaveConflictError): Promise<void> {
  try {
    await audit(db, {
      actorId,
      action: "guide.save_conflict",
      entityType: "guide",
      entityId: error.guideId,
      details: { serverVersion: error.serverVersion },
    });
  } catch (auditError) {
    console.error(
      "Could not record save conflict:",
      auditError instanceof Error ? auditError.message : auditError,
    );
  }
}

export async function restoreGuide(
  db: Db,
  actor: Actor,
  guideId: string,
  revisionId: string,
  expectedVersion: number,
): Promise<SaveResult> {
  try {
    return await db.transaction(async (tx) => {
      const guide = await assertEditor(tx, actor, guideId);
      if (guide.version !== expectedVersion) {
        const [currentTopics, currentProducts] = await Promise.all([
          tx
            .select({ topicId: guideTopics.topicId })
            .from(guideTopics)
            .where(eq(guideTopics.guideId, guide.id)),
          tx
            .select({ productId: guideProducts.productId, note: guideProducts.note })
            .from(guideProducts)
            .where(eq(guideProducts.guideId, guide.id))
            .orderBy(guideProducts.position),
        ]);
        throw new SaveConflictError(
          guideId,
          parseContent({
            ...contentColumns(guide),
            topicIds: currentTopics.map((row) => row.topicId),
            products: currentProducts,
            seoTitle: guide.seoTitle,
            seoDescription: guide.seoDescription,
            featuredImageAlt: guide.featuredImageAlt,
          }),
          guide.version,
        );
      }
      const [revision] = await tx
        .select()
        .from(guideRevisions)
        .where(and(eq(guideRevisions.id, revisionId), eq(guideRevisions.guideId, guide.id)))
        .limit(1);
      if (!revision) throw new UserInputError("That revision could not be found.");
      if (revision.id === guide.currentRevisionId) {
        throw new UserInputError("That revision is already the current draft.");
      }
      const restored = parseContent({
        title: revision.title,
        slug: revision.slug,
        excerpt: revision.excerpt,
        body: revision.body,
        closing: revision.closing,
        category: revision.category,
        subcategoryId: revision.subcategoryId,
        subcategoryGroupId: revision.subcategoryGroupId,
        topicIds: revision.topicIds,
        products: revision.products,
        seoTitle: revision.seoTitle,
        seoDescription: revision.seoDescription,
        featuredImageId: revision.featuredImageId,
        featuredImageAlt: revision.featuredImageAlt,
        featuredImageStyle: revision.featuredImageStyle,
        faqs: revision.faqs,
        articleImageStyle: revision.articleImageStyle,
      });
      await assertReferences(tx, restored);
      if (await liveAddressTaken(tx, guide.id, restored.slug)) {
        throw new UserInputError(
          "This revision's address is now used by another article. Change one of the addresses first.",
        );
      }
      await assertSlugNotReserved(tx, restored.slug);
      const hash = guideContentHash(restored);
      const number = await nextRevisionNumber(tx, guide.id);
      const created = await insertRevision(tx, {
        guideId: guide.id,
        number,
        content: restored,
        hash,
        reason: "restored",
        actorId: actor.id,
        restoredFromRevisionId: revision.id,
      });
      const reset = reviewReset(guide.reviewState);
      const nextVersion = guide.version + 1;
      await replaceAssociations(tx, guide.id, restored);
      await tx
        .update(guides)
        .set({
          ...contentColumns(restored),
          contentHash: hash,
          version: nextVersion,
          currentRevisionId: created.id,
          updatedBy: actor.id,
          updatedAt: new Date(),
          ...reset,
        })
        .where(and(eq(guides.id, guide.id), eq(guides.version, expectedVersion)));
      await audit(tx, {
        actorId: actor.id,
        action: "guide.restored",
        entityType: "guide",
        entityId: guide.id,
        details: {
          revisionId: created.id,
          revisionNumber: number,
          restoredFromRevisionId: revision.id,
          version: nextVersion,
        },
      });
      if (reset) await auditInvalidation(tx, actor.id, guide.id, guide.reviewState, nextVersion);
      return { id: guide.id, version: nextVersion, changed: true, content: restored };
    });
  } catch (error) {
    if (error instanceof SaveConflictError) {
      await recordConflict(db, actor.id, error);
      throw error;
    }
    if (isUniqueViolation(error, "guides_slug_key")) {
      throw new UserInputError(
        "This revision's address is now used by another article. Change one of the addresses first.",
      );
    }
    throw error;
  }
}

export async function deleteGuide(db: Db, actor: Actor, guideId: string): Promise<void> {
  if (!can(actor, "guide.delete")) throw new AuthorizationError();
  await db.transaction(async (tx) => {
    const guide = await assertEditor(tx, actor, guideId);
    if (guide.publishedRevisionId !== null) {
      throw new UserInputError("This article is on the public site. Unpublish it before deleting it.");
    }
    await tx.update(guides).set({ currentRevisionId: null }).where(eq(guides.id, guide.id));
    await audit(tx, {
      actorId: actor.id,
      action: "guide.deleted",
      entityType: "guide",
      entityId: guide.id,
      details: { slug: guide.slug, title: guide.title, everPublished: guide.firstPublishedAt !== null },
    });
    await tx.delete(guides).where(eq(guides.id, guide.id));
  });
}
