import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, guideReviews, guideRevisions, guides } from "@/db/schema";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { GuideFormError } from "@/server/guides/errors";
import { getEditableGuide } from "@/server/guides/queries";
import {
  decideReview,
  PublishBlockedError,
  publishGuide,
  StaleReviewError,
  submitForReview,
  unpublishGuide,
} from "@/server/guides/review";
import { getReviewDetail, listReviewQueue } from "@/server/guides/review-queries";
import { createGuide, restoreGuide, saveGuide } from "@/server/guides/workflow";
import { createProduct, updateProduct } from "@/server/products";
import {
  findRenamedGuide,
  getPublishedGuide,
  listPublishedGuides,
  listSitemapGuides,
  relatedGuides,
  searchPublishedGuides,
} from "@/server/public-content";
import { UserInputError } from "@/server/users";
import { guideContent, publishableBody } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
const db = () => t.db;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

let owner: Actor;
let editor: Actor;
let otherEditor: Actor;
let author: Actor;

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  editor = asActor(await insertUser(t.db, "editor"));
  otherEditor = asActor(await insertUser(t.db, "editor"));
  author = asActor(await insertUser(t.db, "author"));
});

afterAll(async () => {
  await t.close();
});

async function target(guideId: string) {
  const [guide] = await db().select().from(guides).where(eq(guides.id, guideId));
  return {
    guideId,
    version: guide!.version,
    revisionId: guide!.currentRevisionId!,
    contentHash: guide!.contentHash,
  };
}

async function row(guideId: string) {
  const [guide] = await db().select().from(guides).where(eq(guides.id, guideId));
  return guide!;
}

async function auditsFor(guideId: string, action: string) {
  return db()
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, guideId), eq(auditEvents.action, action)))
    .orderBy(desc(auditEvents.id));
}

async function approve(actor: Actor, guideId: string, notes = "") {
  return decideReview(db(), actor, { ...(await target(guideId)), decision: "approved", notes });
}

async function renamedSlug(slug: string) {
  return (await findRenamedGuide(db(), slug))?.slug ?? null;
}

describe("Owner self-approval", () => {
  it("lets the only Owner submit, approve and publish their own article", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "owner-self-approval" }));
    await submitForReview(db(), owner, await target(created.id));
    expect((await row(created.id)).reviewState).toBe("in_review");

    const decision = await approve(owner, created.id, "Checked myself.");
    expect(decision.selfApproved).toBe(true);
    const approved = await row(created.id);
    expect(approved.reviewState).toBe("approved");
    expect(approved.approvedContentHash).toBe(approved.contentHash);

    const [review] = await db().select().from(guideReviews).where(eq(guideReviews.guideId, created.id));
    expect(review).toMatchObject({
      reviewerId: owner.id,
      decision: "approved",
      revisionId: approved.currentRevisionId,
      contentHash: approved.contentHash,
    });
    const [approvalAudit] = await auditsFor(created.id, "guide.review_approved");
    expect(approvalAudit?.details).toMatchObject({
      selfApproved: true,
      revisionId: approved.currentRevisionId,
    });

    const published = await publishGuide(db(), owner, await target(created.id));
    expect(published.firstPublication).toBe(true);
    const live = await row(created.id);
    expect(live.publishedRevisionId).toBe(live.currentRevisionId);
    expect(live.publishedAt).not.toBeNull();
    expect(live.firstPublishedAt?.getTime()).toBe(live.publishedAt?.getTime());
    expect(await getPublishedGuide(db(), "owner-self-approval")).not.toBeNull();
    expect(await auditsFor(created.id, "guide.published")).toHaveLength(1);
  });

  it("does not let an Editor approve an article they created or submitted", async () => {
    const own = await createGuide(db(), editor, guideContent({ slug: "editor-own-article" }));
    await submitForReview(db(), editor, await target(own.id));
    await expect(approve(editor, own.id)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await row(own.id)).reviewState).toBe("in_review");
    expect(await db().select().from(guideReviews).where(eq(guideReviews.guideId, own.id))).toHaveLength(0);
    // Another editor can approve it, and it is not flagged as self-approval.
    expect((await approve(otherEditor, own.id)).selfApproved).toBe(false);

    const authored = await createGuide(db(), author, guideContent({ slug: "editor-submitted-article" }));
    await submitForReview(db(), editor, await target(authored.id));
    await expect(approve(editor, authored.id)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets an Editor request changes on their own work but requires a note", async () => {
    const own = await createGuide(db(), editor, guideContent({ slug: "editor-request-own" }));
    await submitForReview(db(), editor, await target(own.id));
    await expect(
      decideReview(db(), editor, { ...(await target(own.id)), decision: "changes_requested", notes: "  " }),
    ).rejects.toBeInstanceOf(UserInputError);
    await decideReview(db(), editor, {
      ...(await target(own.id)),
      decision: "changes_requested",
      notes: "Tighten the introduction before publishing.",
    });
    const guide = await row(own.id);
    expect(guide.reviewState).toBe("changes_requested");
    expect(guide.approvedContentHash).toBeNull();
    const [review] = await db().select().from(guideReviews).where(eq(guideReviews.guideId, own.id));
    expect(review?.notes).toBe("Tighten the introduction before publishing.");
    expect(await auditsFor(own.id, "guide.review_changes_requested")).toHaveLength(1);
  });
});

describe("role permissions", () => {
  it("lets Authors submit their own articles but not review, publish or submit others' work", async () => {
    const mine = await createGuide(db(), author, guideContent({ slug: "author-submits" }));
    await submitForReview(db(), author, await target(mine.id));
    const [submitted] = await auditsFor(mine.id, "guide.review_requested");
    const current = await row(mine.id);
    expect(submitted?.actorId).toBe(author.id);
    expect(submitted?.details).toMatchObject({
      revisionId: current.currentRevisionId,
      contentHash: current.contentHash,
    });
    await expect(approve(author, mine.id)).rejects.toBeInstanceOf(AuthorizationError);
    await approve(owner, mine.id);
    await expect(publishGuide(db(), author, await target(mine.id))).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    const theirs = await createGuide(db(), editor, guideContent({ slug: "author-cannot-submit" }));
    await expect(submitForReview(db(), author, await target(theirs.id))).rejects.toThrow(
      "Article not found.",
    );
    expect(await listReviewQueue(db(), author, { state: "in_review", page: 1 })).toBeNull();
    expect(await getReviewDetail(db(), author, mine.id)).toBeNull();
  });

  it("rejects double submission and submission of an approved version", async () => {
    const created = await createGuide(db(), author, guideContent({ slug: "double-submit" }));
    await submitForReview(db(), author, await target(created.id));
    await expect(submitForReview(db(), author, await target(created.id))).rejects.toThrow(/already waiting/);
    await approve(owner, created.id);
    await expect(submitForReview(db(), author, await target(created.id))).rejects.toThrow(/already approved/);
  });
});

describe("stale approvals and content-change invalidation", () => {
  it("withdraws a pending submission when the content changes and rejects a decision on the old revision", async () => {
    const created = await createGuide(db(), author, guideContent({ slug: "stale-submission" }));
    await submitForReview(db(), author, await target(created.id));
    const submitted = await target(created.id);
    await saveGuide(
      db(),
      author,
      created.id,
      1,
      guideContent({ slug: "stale-submission", title: "Changed after submit" }),
    );

    const guide = await row(created.id);
    expect(guide.reviewState).toBe("not_requested");
    const [invalidated] = await auditsFor(created.id, "guide.review_invalidated");
    expect(invalidated?.details).toMatchObject({ from: "in_review" });

    await expect(
      decideReview(db(), owner, { ...submitted, decision: "approved", notes: "" }),
    ).rejects.toBeInstanceOf(StaleReviewError);
    // Even with the fresh target it is no longer in review; it must be resubmitted.
    await expect(approve(owner, created.id)).rejects.toThrow(/not waiting for review/);
    expect(await db().select().from(guideReviews).where(eq(guideReviews.guideId, created.id))).toHaveLength(
      0,
    );
  });

  it("rejects a decision whose content hash or revision does not match the current one", async () => {
    const created = await createGuide(db(), author, guideContent({ slug: "stale-hash" }));
    await submitForReview(db(), author, await target(created.id));
    const fresh = await target(created.id);
    await expect(
      decideReview(db(), owner, { ...fresh, contentHash: "0".repeat(64), decision: "approved", notes: "" }),
    ).rejects.toBeInstanceOf(StaleReviewError);
    await expect(
      decideReview(db(), owner, {
        ...fresh,
        revisionId: "00000000-0000-4000-8000-000000000000",
        decision: "approved",
        notes: "",
      }),
    ).rejects.toBeInstanceOf(StaleReviewError);
    await expect(
      decideReview(db(), owner, { ...fresh, version: fresh.version + 1, decision: "approved", notes: "" }),
    ).rejects.toBeInstanceOf(StaleReviewError);
  });

  it("invalidates an approval on any material save; publishing then fails until re-approved", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "approval-invalidated" }));
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    const approvedTarget = await target(created.id);
    await saveGuide(
      db(),
      owner,
      created.id,
      approvedTarget.version,
      guideContent({ slug: "approval-invalidated", excerpt: `${guideContent().excerpt} Updated.` }),
    );
    const guide = await row(created.id);
    expect(guide.reviewState).toBe("not_requested");
    expect(guide.approvedContentHash).toBeNull();
    expect((await auditsFor(created.id, "guide.review_invalidated"))[0]?.details).toMatchObject({
      from: "approved",
    });

    await expect(publishGuide(db(), owner, approvedTarget)).rejects.toBeInstanceOf(StaleReviewError);
    await expect(publishGuide(db(), owner, await target(created.id))).rejects.toBeInstanceOf(
      PublishBlockedError,
    );
    expect((await row(created.id)).publishedRevisionId).toBeNull();

    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    await publishGuide(db(), owner, await target(created.id));
    expect((await row(created.id)).publishedRevisionId).toBe(guide.currentRevisionId);
  });

  it("does not change review state when a save makes no material change", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "no-op-save-keeps-approval" }));
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    const result = await saveGuide(
      db(),
      owner,
      created.id,
      1,
      guideContent({ slug: "no-op-save-keeps-approval" }),
    );
    expect(result.changed).toBe(false);
    expect((await row(created.id)).reviewState).toBe("approved");
  });

  it("invalidates an approval when an older revision is restored, even with identical content", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "restore-invalidates" }));
    const first = await target(created.id);
    await saveGuide(
      db(),
      owner,
      created.id,
      1,
      guideContent({ slug: "restore-invalidates", title: "Second title here" }),
    );
    await saveGuide(db(), owner, created.id, 2, guideContent({ slug: "restore-invalidates" }));
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    await restoreGuide(db(), owner, created.id, first.revisionId, 3);
    const guide = await row(created.id);
    expect(guide.contentHash).toBe(first.contentHash);
    expect(guide.reviewState).toBe("not_requested");
    await expect(publishGuide(db(), owner, await target(created.id))).rejects.toBeInstanceOf(
      PublishBlockedError,
    );
  });

  it("refuses to publish when the latest review does not cover the exact current revision", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "approval-wrong-revision" }));
    const first = await target(created.id);
    await saveGuide(
      db(),
      owner,
      created.id,
      1,
      guideContent({ slug: "approval-wrong-revision", title: "Revised title here" }),
    );
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    // Simulate an approval row that points at a different revision than the one being published.
    await db()
      .update(guideReviews)
      .set({ revisionId: first.revisionId })
      .where(eq(guideReviews.guideId, created.id));
    await expect(publishGuide(db(), owner, await target(created.id))).rejects.toThrow(
      /approval does not match the current revision/,
    );
    expect((await row(created.id)).publishedRevisionId).toBeNull();
  });
});

describe("publication safeguards", () => {
  it("blocks publishing an approved revision that fails the publication rules", async () => {
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug: "approved-but-short", excerpt: "Too short to publish yet." }),
    );
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    const error = await publishGuide(db(), owner, await target(created.id)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PublishBlockedError);
    expect((error as PublishBlockedError).issues.join(" ")).toMatch(/Summary must be 100–300 characters/);
    const guide = await row(created.id);
    expect(guide.publishedRevisionId).toBeNull();
    expect(guide.firstPublishedAt).toBeNull();
    expect(await auditsFor(created.id, "guide.published")).toHaveLength(0);
  });

  it("blocks publishing when a linked product is no longer active", async () => {
    const product = await createProduct(db(), owner, {
      name: "Stackable pantry jar",
      slug: "stackable-pantry-jar-publish",
      brand: "",
      summary: "Clear jar used for testing publication safeguards only.",
      merchantName: "",
      productUrl: "https://shop.example.com/jar",
      verifiedOn: "2026-01-10",
      status: "active",
    });
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug: "inactive-product-blocks", products: [{ productId: product.id, note: null }] }),
    );
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    await updateProduct(
      db(),
      owner,
      product.id,
      1,
      {
        name: "Stackable pantry jar",
        slug: "stackable-pantry-jar-publish",
        brand: "",
        summary: "Clear jar used for testing publication safeguards only.",
        merchantName: "",
        productUrl: "https://shop.example.com/jar",
        verifiedOn: "2026-01-10",
        status: "retired",
      },
      [],
    );
    await expect(publishGuide(db(), owner, await target(created.id))).rejects.toThrow(/must be active/);
    expect((await row(created.id)).publishedRevisionId).toBeNull();
  });

  it("blocks publishing when an image linked in the body is missing from the library", async () => {
    const body = `${publishableBody()}\n\n![Shelf photo](/media/11111111-2222-4333-8444-555555555555/shelf.png)`;
    const created = await createGuide(db(), owner, guideContent({ slug: "missing-body-image", body }));
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    await expect(publishGuide(db(), owner, await target(created.id))).rejects.toThrow(
      /no longer in the media library/,
    );
  });

  it("rejects publishing with a stale version and does not publish twice", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "publish-stale-version" }));
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    const fresh = await target(created.id);
    await expect(publishGuide(db(), owner, { ...fresh, version: fresh.version + 1 })).rejects.toBeInstanceOf(
      StaleReviewError,
    );
    const results = await Promise.allSettled([
      publishGuide(db(), owner, fresh),
      publishGuide(db(), owner, fresh),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await auditsFor(created.id, "guide.published")).toHaveLength(1);
  });

  it("keeps the old revision live while a newer draft is unapproved, then publishes the approved one", async () => {
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug: "republish-newer", title: "Live title one" }),
    );
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    await publishGuide(db(), owner, await target(created.id));
    const firstLive = await row(created.id);

    await saveGuide(
      db(),
      owner,
      created.id,
      firstLive.version,
      guideContent({ slug: "republish-newer", title: "Draft title two" }),
    );
    expect((await getPublishedGuide(db(), "republish-newer"))?.title).toBe("Live title one");
    expect((await getEditableGuide(db(), owner, created.id))?.publication).toBe("unpublished_edits");

    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    const second = await publishGuide(db(), owner, await target(created.id));
    expect(second.firstPublication).toBe(false);
    const secondLive = await row(created.id);
    expect(secondLive.firstPublishedAt?.getTime()).toBe(firstLive.firstPublishedAt?.getTime());
    expect(secondLive.publishedRevisionId).toBe(secondLive.currentRevisionId);
    expect((await getPublishedGuide(db(), "republish-newer"))?.title).toBe("Draft title two");
    await expect(publishGuide(db(), owner, await target(created.id))).rejects.toThrow(/already published/);
  });
});

describe("unpublishing", () => {
  async function publishedArticle(slug: string) {
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug, title: `Unpublish sample ${slug}`, category: "kitchen" }),
    );
    await submitForReview(db(), owner, await target(created.id));
    await approve(owner, created.id);
    await publishGuide(db(), owner, await target(created.id));
    return row(created.id);
  }

  it("requires confirmation, a reason and the current published revision", async () => {
    const guide = await publishedArticle("unpublish-checks");
    const base = {
      guideId: guide.id,
      publishedRevisionId: guide.publishedRevisionId!,
      reason: "Out of date advice.",
    };
    await expect(unpublishGuide(db(), owner, { ...base, confirmed: false })).rejects.toThrow(/confirm/i);
    await expect(unpublishGuide(db(), owner, { ...base, reason: "short", confirmed: true })).rejects.toThrow(
      /reason/i,
    );
    await expect(
      unpublishGuide(db(), owner, {
        ...base,
        publishedRevisionId: "00000000-0000-4000-8000-000000000000",
        confirmed: true,
      }),
    ).rejects.toBeInstanceOf(StaleReviewError);
    await expect(unpublishGuide(db(), author, { ...base, confirmed: true })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect((await row(guide.id)).publishedRevisionId).toBe(guide.publishedRevisionId);
  });

  it("removes the article from every public surface but keeps its history", async () => {
    await publishedArticle("unpublish-neighbour");
    const guide = await publishedArticle("unpublish-target");
    expect(await getPublishedGuide(db(), "unpublish-target")).not.toBeNull();

    await unpublishGuide(db(), owner, {
      guideId: guide.id,
      publishedRevisionId: guide.publishedRevisionId!,
      reason: "Advice needs a full rewrite.",
      confirmed: true,
    });
    const after = await row(guide.id);
    expect(after.publishedRevisionId).toBeNull();
    expect(after.publishedAt).toBeNull();
    expect(after.firstPublishedAt?.getTime()).toBe(guide.firstPublishedAt?.getTime());

    expect(await getPublishedGuide(db(), "unpublish-target")).toBeNull();
    const slugs = (items: Array<{ slug: string }>) => items.map((item) => item.slug);
    expect(slugs(await listPublishedGuides(db(), { limit: 100 }))).not.toContain("unpublish-target");
    expect(slugs(await listSitemapGuides(db()))).not.toContain("unpublish-target");
    expect(slugs(await searchPublishedGuides(db(), "Unpublish sample"))).not.toContain("unpublish-target");
    expect(
      slugs(
        await relatedGuides(db(), { slug: "unpublish-neighbour", category: "kitchen", topicIds: [] }, 50),
      ),
    ).not.toContain("unpublish-target");

    expect(
      await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, guide.id)),
    ).not.toHaveLength(0);
    expect(await db().select().from(guideReviews).where(eq(guideReviews.guideId, guide.id))).toHaveLength(1);
    const [audit] = await auditsFor(guide.id, "guide.unpublished");
    expect(audit?.details).toMatchObject({
      reason: "Advice needs a full rewrite.",
      revisionId: guide.publishedRevisionId,
    });

    const renamed = await saveGuide(
      db(),
      owner,
      guide.id,
      after.version,
      guideContent({ slug: "unpublish-target-renamed" }),
    );
    expect(renamed.content.slug).toBe("unpublish-target-renamed");
    expect(await renamedSlug("unpublish-target")).toBeNull();
    await expect(
      unpublishGuide(db(), owner, {
        guideId: guide.id,
        publishedRevisionId: guide.publishedRevisionId!,
        reason: "Second attempt at unpublishing.",
        confirmed: true,
      }),
    ).rejects.toThrow(/not published/);
  });
});

describe("address changes after publication", () => {
  async function publish(guideId: string) {
    await submitForReview(db(), owner, await target(guideId));
    await approve(owner, guideId);
    return publishGuide(db(), owner, await target(guideId));
  }

  async function rename(guideId: string, slug: string, title: string) {
    const current = await row(guideId);
    return saveGuide(db(), owner, guideId, current.version, guideContent({ slug, title }));
  }

  it("keeps the live address until republished, then redirects every earlier address", async () => {
    const title = "Address change sample article";
    const created = await createGuide(db(), owner, guideContent({ slug: "address-first", title }));
    await publish(created.id);

    await rename(created.id, "address-second", title);
    expect(await getPublishedGuide(db(), "address-first")).not.toBeNull();
    expect(await getPublishedGuide(db(), "address-second")).toBeNull();
    expect(await renamedSlug("address-first")).toBeNull();

    const republished = await publish(created.id);
    expect(republished.slug).toBe("address-second");
    expect(await getPublishedGuide(db(), "address-first")).toBeNull();
    expect((await getPublishedGuide(db(), "address-second"))?.id).toBe(created.id);
    expect(await renamedSlug("address-first")).toBe("address-second");
    expect(await renamedSlug("address-second")).toBeNull();

    await rename(created.id, "address-third", title);
    await publish(created.id);
    expect(await renamedSlug("address-first")).toBe("address-third");
    expect(await renamedSlug("address-second")).toBe("address-third");
    expect(await renamedSlug("address-never-used")).toBeNull();
    expect(await findRenamedGuide(db(), "address-first")).toEqual({
      slug: "address-third",
      category: "kitchen",
    });
  });

  it("does not redirect an address that another live article now uses", async () => {
    const moved = await createGuide(
      db(),
      owner,
      guideContent({ slug: "address-shared", title: "Moved article" }),
    );
    await publish(moved.id);
    await rename(moved.id, "address-moved", "Moved article");
    await publish(moved.id);

    const taker = await createGuide(
      db(),
      owner,
      guideContent({ slug: "address-shared", title: "New owner of the address" }),
    );
    await publish(taker.id);
    expect((await getPublishedGuide(db(), "address-shared"))?.id).toBe(taker.id);
  });

  it("stops another article from taking an address that is still live", async () => {
    const live = await createGuide(
      db(),
      owner,
      guideContent({ slug: "address-held", title: "Held article" }),
    );
    await publish(live.id);
    await rename(live.id, "address-held-draft", "Held article");

    await expect(
      createGuide(db(), owner, guideContent({ slug: "address-held", title: "Copycat article" })),
    ).rejects.toBeInstanceOf(GuideFormError);
    const other = await createGuide(
      db(),
      owner,
      guideContent({ slug: "address-other", title: "Other article" }),
    );
    await expect(rename(other.id, "address-held", "Other article")).rejects.toBeInstanceOf(GuideFormError);

    // Simulates a save that passed its check before the other article went live at this address.
    await submitForReview(db(), owner, await target(other.id));
    await approve(owner, other.id);
    await db()
      .update(guideRevisions)
      .set({ slug: "address-held" })
      .where(eq(guideRevisions.id, (await row(other.id)).currentRevisionId!));
    await expect(publishGuide(db(), owner, await target(other.id))).rejects.toThrow(
      /Another published article already uses this address/,
    );
    expect((await row(other.id)).publishedRevisionId).toBeNull();
    expect((await getPublishedGuide(db(), "address-held"))?.id).toBe(live.id);
  });

  it("restores an earlier address unless another live article uses it", async () => {
    const title = "Restorable address article";
    const created = await createGuide(db(), owner, guideContent({ slug: "restore-address-old", title }));
    const [first] = await db()
      .select({ id: guideRevisions.id })
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, created.id));
    await publish(created.id);
    await rename(created.id, "restore-address-new", title);
    await publish(created.id);

    const restored = await restoreGuide(db(), owner, created.id, first!.id, (await row(created.id)).version);
    expect(restored.content.slug).toBe("restore-address-old");

    const draft = await createGuide(db(), owner, guideContent({ slug: "restore-draft-old", title }));
    const [draftFirst] = await db()
      .select({ id: guideRevisions.id })
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, draft.id));
    await rename(draft.id, "restore-draft-new", title);
    const taker = await createGuide(
      db(),
      owner,
      guideContent({ slug: "restore-draft-old", title: "Article taking the address" }),
    );
    await publish(taker.id);
    await expect(
      restoreGuide(db(), owner, draft.id, draftFirst!.id, (await row(draft.id)).version),
    ).rejects.toThrow(/address is now used by another article/);
  });
});

describe("review queue and detail", () => {
  it("lists submitted articles with the submitter and shows review history", async () => {
    const created = await createGuide(
      db(),
      author,
      guideContent({ slug: "queue-listing", title: "Queue listing article" }),
    );
    await submitForReview(db(), author, await target(created.id));
    const queue = await listReviewQueue(db(), editor, { state: "in_review", page: 1 });
    const item = queue?.items.find((entry) => entry.id === created.id);
    expect(item?.submitterName).toBe(author.name);
    expect(item?.submittedAt).toBeInstanceOf(Date);

    await decideReview(db(), editor, {
      ...(await target(created.id)),
      decision: "changes_requested",
      notes: "Add a section on cleaning.",
    });
    const detail = await getReviewDetail(db(), editor, created.id);
    expect(detail?.reviewState).toBe("changes_requested");
    expect(detail?.canApprove).toBe(true);
    expect(
      detail?.history.map((entry) => (entry.kind === "decision" ? entry.decision : entry.action)),
    ).toEqual(expect.arrayContaining(["changes_requested", "guide.review_requested"]));
    expect((await getEditableGuide(db(), author, created.id))?.latestReview?.notes).toBe(
      "Add a section on cleaning.",
    );
  });
});
