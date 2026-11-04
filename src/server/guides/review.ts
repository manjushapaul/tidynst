import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  guideReviews,
  guideRevisions,
  guides,
  mediaAssets,
  products,
  topics,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { resolveArticleImageStyle } from "@/lib/content/article-image-style";
import { resolveFeaturedImageStyle } from "@/lib/content/featured-image-style";
import type { GuideContent } from "@/lib/content/guide-schema";
import { bodyMediaIds, publishIssues } from "@/lib/content/publish-rules";
import { audit } from "@/server/audit";
import { type Actor, AuthorizationError, assertCan, canEditGuide } from "@/server/auth/permissions";
import { UserInputError } from "@/server/users";
import { liveAddressTaken, lockAddress } from "./addresses";

/**
 * Lock order: the guide row (`FOR UPDATE`) first, then media rows and product rows (`FOR SHARE`).
 * Product status changes lock only the product row and media deletion only the media row, and
 * neither locks guides, so these operations cannot deadlock with publishing. Publishing then takes
 * one advisory lock for the article's address, which nothing else takes.
 */

export const REVIEW_NOTE_MAX = 2000;
export const CHANGES_NOTE_MIN = 10;
export const UNPUBLISH_REASON_MIN = 10;
export const UNPUBLISH_REASON_MAX = 500;

export class StaleReviewError extends UserInputError {
  override name = "StaleReviewError";
  constructor(
    message = "This article changed after you opened it. Reload the page to see the latest version before continuing.",
  ) {
    super(message);
  }
}

export class PublishBlockedError extends UserInputError {
  override name = "PublishBlockedError";
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      issues.length === 1
        ? `This article cannot be published yet: ${issues[0]}`
        : `This article cannot be published yet. Fix ${issues.length} problems: ${issues.join(" ")}`,
    );
    this.issues = issues;
  }
}

/** The exact working state the user saw when they pressed the button. */
export type ReviewTarget = { guideId: string; version: number; revisionId: string; contentHash: string };

type GuideRow = typeof guides.$inferSelect;
type RevisionRow = typeof guideRevisions.$inferSelect;

async function lockGuide(tx: Db, guideId: string): Promise<GuideRow> {
  const [guide] = await tx.select().from(guides).where(eq(guides.id, guideId)).for("update");
  if (!guide) throw new UserInputError("Article not found.");
  return guide;
}

function assertTarget(guide: GuideRow, target: ReviewTarget): void {
  if (
    guide.version !== target.version ||
    guide.currentRevisionId !== target.revisionId ||
    guide.contentHash !== target.contentHash
  ) {
    throw new StaleReviewError();
  }
}

/** The current revision must exist and hold exactly the working copy's content. */
async function currentRevision(tx: Db, guide: GuideRow): Promise<RevisionRow> {
  if (!guide.currentRevisionId) throw new UserInputError("Save the article before continuing.");
  const [revision] = await tx
    .select()
    .from(guideRevisions)
    .where(and(eq(guideRevisions.id, guide.currentRevisionId), eq(guideRevisions.guideId, guide.id)))
    .limit(1);
  if (!revision || revision.contentHash !== guide.contentHash) {
    throw new UserInputError("The saved revision does not match the article. Save the article again.");
  }
  return revision;
}

export function revisionContent(revision: RevisionRow): GuideContent {
  return {
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
    featuredImageStyle: resolveFeaturedImageStyle(revision.featuredImageStyle),
    faqs: revision.faqs,
    articleImageStyle: resolveArticleImageStyle(revision.articleImageStyle),
  };
}

/**
 * Every publication check for one content snapshot. With `lock`, the referenced media and product
 * rows are held `FOR SHARE` until the transaction ends, so they cannot be deleted or deactivated
 * between this check and the publish write.
 */
export async function collectPublishIssues(tx: Db, content: GuideContent, lock: boolean): Promise<string[]> {
  const mediaIds = [...new Set([...bodyMediaIds(content.body), content.featuredImageId ?? ""])].filter(
    Boolean,
  );
  const productIds = content.products.map((item) => item.productId);

  const mediaQuery = mediaIds.length
    ? tx.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.id, mediaIds))
    : null;
  const mediaRows = mediaQuery ? await (lock ? mediaQuery.for("share") : mediaQuery) : [];

  const productQuery = productIds.length
    ? tx
        .select({ id: products.id, status: products.status })
        .from(products)
        .where(inArray(products.id, productIds))
    : null;
  const productRows = productQuery ? await (lock ? productQuery.for("share") : productQuery) : [];

  const topicRows = content.topicIds.length
    ? await tx.select({ id: topics.id }).from(topics).where(inArray(topics.id, content.topicIds))
    : [];

  const knownMediaIds = new Set(mediaRows.map((row) => row.id.toLowerCase()));
  const issues = publishIssues(content, {
    productStatus: new Map(productRows.map((row) => [row.id, row.status])),
    knownTopicIds: new Set(topicRows.map((row) => row.id)),
    featuredImageExists: content.featuredImageId
      ? knownMediaIds.has(content.featuredImageId.toLowerCase())
      : false,
    knownMediaIds,
  });
  return [...new Set(issues.map((issue) => issue.message))];
}

async function latestSubmitter(tx: Db, guideId: string): Promise<string | null> {
  const [row] = await tx
    .select({ actorId: auditEvents.actorId })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.action, "guide.review_requested"),
        eq(auditEvents.entityType, "guide"),
        eq(auditEvents.entityId, guideId),
      ),
    )
    .orderBy(desc(auditEvents.id))
    .limit(1);
  return row?.actorId ?? null;
}

export async function submitForReview(db: Db, actor: Actor, target: ReviewTarget): Promise<void> {
  assertCan(actor, "guide.submit");
  await db.transaction(async (tx) => {
    const guide = await lockGuide(tx, target.guideId);
    if (!canEditGuide(actor, guide)) throw new UserInputError("Article not found.");
    assertTarget(guide, target);
    if (guide.reviewState === "in_review")
      throw new UserInputError("This article is already waiting for review.");
    if (guide.reviewState === "approved") throw new UserInputError("This version is already approved.");
    const revision = await currentRevision(tx, guide);
    await tx.update(guides).set({ reviewState: "in_review" }).where(eq(guides.id, guide.id));
    await audit(tx, {
      actorId: actor.id,
      action: "guide.review_requested",
      entityType: "guide",
      entityId: guide.id,
      details: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        contentHash: revision.contentHash,
        version: guide.version,
        from: guide.reviewState,
      },
    });
  });
}

export type ReviewDecisionInput = ReviewTarget & {
  decision: "approved" | "changes_requested";
  notes: string;
};

function normaliseNotes(decision: ReviewDecisionInput["decision"], raw: string): string | null {
  const notes = raw.trim();
  if (notes.length > REVIEW_NOTE_MAX)
    throw new UserInputError(`Keep the note under ${REVIEW_NOTE_MAX} characters.`);
  if (decision === "changes_requested" && notes.length < CHANGES_NOTE_MIN) {
    throw new UserInputError(
      `Explain what needs to change (at least ${CHANGES_NOTE_MIN} characters) so the author can fix it.`,
    );
  }
  return notes || null;
}

/**
 * Records a review decision against the exact revision and content hash that was submitted.
 * The Owner may approve their own work (TidyNest has a single Owner); editors may not approve an
 * article they created, wrote the current revision of, or submitted.
 */
export async function decideReview(
  db: Db,
  actor: Actor,
  input: ReviewDecisionInput,
): Promise<{ reviewId: string; selfApproved: boolean }> {
  assertCan(actor, "guide.review");
  const notes = normaliseNotes(input.decision, input.notes);
  return db.transaction(async (tx) => {
    const guide = await lockGuide(tx, input.guideId);
    assertTarget(guide, input);
    if (guide.reviewState !== "in_review")
      throw new UserInputError("This article is not waiting for review.");
    const revision = await currentRevision(tx, guide);
    const submitterId = await latestSubmitter(tx, guide.id);
    const ownWork = [guide.createdBy, revision.createdBy, submitterId].includes(actor.id);
    if (input.decision === "approved" && ownWork && actor.role !== "owner") {
      throw new AuthorizationError(
        "You cannot approve an article you wrote or submitted. Ask the owner or another editor to review it.",
      );
    }
    const [review] = await tx
      .insert(guideReviews)
      .values({
        guideId: guide.id,
        revisionId: revision.id,
        contentHash: revision.contentHash,
        reviewerId: actor.id,
        decision: input.decision,
        notes,
      })
      .returning({ id: guideReviews.id });
    if (!review) throw new Error("Review insert returned no row.");
    await tx
      .update(guides)
      .set(
        input.decision === "approved"
          ? { reviewState: "approved", approvedContentHash: revision.contentHash }
          : { reviewState: "changes_requested", approvedContentHash: null },
      )
      .where(eq(guides.id, guide.id));
    const selfApproved = input.decision === "approved" && ownWork;
    await audit(tx, {
      actorId: actor.id,
      action: input.decision === "approved" ? "guide.review_approved" : "guide.review_changes_requested",
      entityType: "guide",
      entityId: guide.id,
      details: {
        reviewId: review.id,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        contentHash: revision.contentHash,
        ...(input.decision === "approved" ? { selfApproved } : {}),
      },
    });
    return { reviewId: review.id, selfApproved };
  });
}

export type PublicPathsChange = { slug: string; category: string | null; topicIds: string[] };

export async function publishGuide(
  db: Db,
  actor: Actor,
  target: { guideId: string; version: number; revisionId: string },
): Promise<PublicPathsChange & { firstPublication: boolean }> {
  assertCan(actor, "guide.publish");
  return db.transaction(async (tx) => {
    const guide = await lockGuide(tx, target.guideId);
    if (guide.version !== target.version || guide.currentRevisionId !== target.revisionId) {
      throw new StaleReviewError();
    }
    if (guide.publishedRevisionId && guide.publishedRevisionId === guide.currentRevisionId) {
      throw new UserInputError("This version is already published.");
    }
    if (guide.reviewState !== "approved" || guide.approvedContentHash !== guide.contentHash) {
      throw new PublishBlockedError(["Approve the current version before publishing it."]);
    }
    const revision = await currentRevision(tx, guide);
    const [latestReview] = await tx
      .select({
        decision: guideReviews.decision,
        revisionId: guideReviews.revisionId,
        contentHash: guideReviews.contentHash,
      })
      .from(guideReviews)
      .where(eq(guideReviews.guideId, guide.id))
      .orderBy(desc(guideReviews.createdAt))
      .limit(1);
    if (
      !latestReview ||
      latestReview.decision !== "approved" ||
      latestReview.revisionId !== revision.id ||
      latestReview.contentHash !== revision.contentHash
    ) {
      throw new PublishBlockedError([
        "The approval does not match the current revision. Submit the article for review again.",
      ]);
    }
    const content = revisionContent(revision);
    const issues = await collectPublishIssues(tx, content, true);
    await lockAddress(tx, content.slug);
    if (await liveAddressTaken(tx, guide.id, content.slug)) {
      issues.push("Another published article already uses this address. Choose a different address.");
    }
    if (issues.length > 0) throw new PublishBlockedError(issues);

    const now = new Date();
    const firstPublication = guide.firstPublishedAt === null;
    await tx
      .update(guides)
      .set({
        publishedRevisionId: revision.id,
        publishedAt: now,
        ...(firstPublication ? { firstPublishedAt: now } : {}),
      })
      .where(eq(guides.id, guide.id));
    await audit(tx, {
      actorId: actor.id,
      action: "guide.published",
      entityType: "guide",
      entityId: guide.id,
      details: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        contentHash: revision.contentHash,
        previousRevisionId: guide.publishedRevisionId,
        firstPublication,
      },
    });
    return {
      slug: revision.slug,
      category: revision.category,
      topicIds: revision.topicIds,
      firstPublication,
    };
  });
}

export async function unpublishGuide(
  db: Db,
  actor: Actor,
  input: { guideId: string; publishedRevisionId: string; reason: string; confirmed: boolean },
): Promise<PublicPathsChange> {
  assertCan(actor, "guide.publish");
  if (!input.confirmed)
    throw new UserInputError("Tick the box to confirm you want to unpublish this article.");
  const reason = input.reason.trim();
  if (reason.length < UNPUBLISH_REASON_MIN || reason.length > UNPUBLISH_REASON_MAX) {
    throw new UserInputError(
      `Give a reason of ${UNPUBLISH_REASON_MIN}–${UNPUBLISH_REASON_MAX} characters for the audit log.`,
    );
  }
  return db.transaction(async (tx) => {
    const guide = await lockGuide(tx, input.guideId);
    if (!guide.publishedRevisionId) throw new UserInputError("This article is not published.");
    if (guide.publishedRevisionId !== input.publishedRevisionId) throw new StaleReviewError();
    const [revision] = await tx
      .select({
        slug: guideRevisions.slug,
        category: guideRevisions.category,
        topicIds: guideRevisions.topicIds,
        revisionNumber: guideRevisions.revisionNumber,
      })
      .from(guideRevisions)
      .where(eq(guideRevisions.id, guide.publishedRevisionId))
      .limit(1);
    await tx
      .update(guides)
      .set({ publishedRevisionId: null, publishedAt: null })
      .where(eq(guides.id, guide.id));
    await audit(tx, {
      actorId: actor.id,
      action: "guide.unpublished",
      entityType: "guide",
      entityId: guide.id,
      details: {
        revisionId: guide.publishedRevisionId,
        revisionNumber: revision?.revisionNumber ?? null,
        reason,
      },
    });
    return {
      slug: revision?.slug ?? guide.slug,
      category: revision?.category ?? null,
      topicIds: revision?.topicIds ?? [],
    };
  });
}
