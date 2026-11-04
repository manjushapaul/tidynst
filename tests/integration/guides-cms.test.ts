import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, guideRevisions, guides, products, topics } from "@/db/schema";
import type { Db } from "@/db/types";
import { guideContentHash } from "@/lib/content/content-hash";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { GuideFormError, SaveConflictError } from "@/server/guides/errors";
import {
  getDraftPreview,
  getEditableGuide,
  listGuides,
  normaliseGuideListQuery,
} from "@/server/guides/queries";
import { unpublishGuide } from "@/server/guides/review";
import { createGuide, deleteGuide, restoreGuide, saveGuide } from "@/server/guides/workflow";
import { getPublishedGuide, listSitemapGuides, searchPublishedGuides } from "@/server/public-content";
import { UserInputError } from "@/server/users";
import { guideContent } from "../support/fixtures";
import { insertGuide, insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
const db = () => t.db;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

async function audits(database: Db, action: string) {
  return database.select().from(auditEvents).where(eq(auditEvents.action, action));
}

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe("guide creation and editing", () => {
  it("creates an unpublished draft and revision 1 with reason created", async () => {
    const author = asActor(await insertUser(db(), "author"));
    const created = await createGuide(db(), author, guideContent({ slug: "draft-created-once" }));
    const [guide] = await db().select().from(guides).where(eq(guides.id, created.id));
    const [revision] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    expect(guide?.publishedRevisionId).toBeNull();
    expect(guide?.publishedAt).toBeNull();
    expect(guide?.firstPublishedAt).toBeNull();
    expect(guide?.version).toBe(1);
    expect(guide?.currentRevisionId).toBe(revision?.id);
    expect(revision?.revisionNumber).toBe(1);
    expect(revision?.reason).toBe("created");
    expect(await audits(db(), "guide.created")).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: created.id })]),
    );
    expect(await getPublishedGuide(db(), "draft-created-once")).toBeNull();
  });

  it("saves a revision only when content changes and leaves the published pointer alone", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const seeded = await insertGuide(db(), editor.id, { slug: "published-pointer" }, { published: true });
    const [before] = await db().select().from(guides).where(eq(guides.id, seeded.guide.id));
    const publishedAt = before?.publishedAt;
    const unchanged = await saveGuide(
      db(),
      editor,
      seeded.guide.id,
      1,
      guideContent({ slug: "published-pointer" }),
    );
    expect(unchanged.changed).toBe(false);
    expect(
      await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, seeded.guide.id)),
    ).toHaveLength(1);

    const saved = await saveGuide(
      db(),
      editor,
      seeded.guide.id,
      1,
      guideContent({ slug: "published-pointer", title: "A revised title for the platform guide" }),
    );
    expect(saved.changed).toBe(true);
    expect(saved.version).toBe(2);
    const again = await saveGuide(
      db(),
      editor,
      seeded.guide.id,
      2,
      guideContent({ slug: "published-pointer", title: "A revised title for the platform guide" }),
    );
    expect(again.changed).toBe(false);
    const revisions = await db()
      .select()
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, seeded.guide.id));
    expect(revisions).toHaveLength(2);
    expect(revisions.find((revision) => revision.revisionNumber === 2)?.reason).toBe("saved");
    const [guide] = await db().select().from(guides).where(eq(guides.id, seeded.guide.id));
    expect(guide?.publishedRevisionId).toBe(seeded.revision.id);
    expect(guide?.publishedAt?.getTime()).toBe(publishedAt?.getTime());
    expect(guide?.firstPublishedAt).not.toBeNull();
    expect(await audits(db(), "guide.saved")).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: seeded.guide.id })]),
    );
  });

  it("rejects invalid category, topic, product, media and duplicate associations", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const [topic] = await db().select({ id: topics.id }).from(topics).limit(1);
    const [product] = await db()
      .insert(products)
      .values({
        slug: "synthetic-rack",
        name: "Synthetic rack",
        summary: "Not a real product. Used only by the test database.",
        status: "draft",
        createdBy: editor.id,
        updatedBy: editor.id,
      })
      .returning({ id: products.id });
    const base = guideContent({ slug: "validation-guide" });
    await expect(createGuide(db(), editor, { ...base, category: "no-drill" })).rejects.toBeInstanceOf(
      GuideFormError,
    );
    await expect(
      createGuide(db(), editor, { ...base, topicIds: [topic!.id, topic!.id] }),
    ).rejects.toBeInstanceOf(GuideFormError);
    await expect(
      createGuide(db(), editor, {
        ...base,
        topicIds: ["00000000-0000-4000-8000-000000000099"],
      }),
    ).rejects.toBeInstanceOf(GuideFormError);
    await expect(
      createGuide(db(), editor, {
        ...base,
        slug: "validation-products",
        products: [
          { productId: product!.id, note: null },
          { productId: product!.id, note: "again" },
        ],
      }),
    ).rejects.toBeInstanceOf(GuideFormError);
    await expect(
      createGuide(db(), editor, {
        ...base,
        slug: "validation-missing-product",
        products: [{ productId: "00000000-0000-4000-8000-000000000098", note: null }],
      }),
    ).rejects.toBeInstanceOf(GuideFormError);
    await expect(
      createGuide(db(), editor, {
        ...base,
        slug: "validation-media",
        featuredImageId: "00000000-0000-4000-8000-000000000097",
      }),
    ).rejects.toBeInstanceOf(GuideFormError);
    await expect(
      createGuide(db(), editor, { ...base, slug: "validation-body", body: "x".repeat(100_001) }),
    ).rejects.toBeInstanceOf(GuideFormError);
    const rows = await db().select({ id: guides.id }).from(guides).where(eq(guides.slug, "validation-guide"));
    expect(rows).toHaveLength(0);
  });

  it("lets the address change before and after first publication", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const seeded = await insertGuide(db(), editor.id, { slug: "published-slug" }, { published: true });
    const moved = await saveGuide(db(), editor, seeded.guide.id, 1, guideContent({ slug: "a-new-slug" }));
    expect(moved.content.slug).toBe("a-new-slug");
    expect(await getPublishedGuide(db(), "published-slug")).not.toBeNull();
    const draft = await createGuide(
      db(),
      editor,
      guideContent({ slug: "unlocked-slug", title: "Unlocked draft title" }),
    );
    const renamed = await saveGuide(
      db(),
      editor,
      draft.id,
      1,
      guideContent({ slug: "renamed-draft", title: "Unlocked draft title" }),
    );
    expect(renamed.content.slug).toBe("renamed-draft");
  });
});

describe("concurrency, history and access", () => {
  it("rejects a stale save, keeps the newer content, and audits the conflict", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const created = await createGuide(
      db(),
      editor,
      guideContent({ slug: "conflict-guide", title: "Original conflict title" }),
    );
    await saveGuide(
      db(),
      editor,
      created.id,
      1,
      guideContent({ slug: "conflict-guide", title: "Newer conflict title here" }),
    );
    const stale = guideContent({ slug: "conflict-guide", title: "Stale conflict title here" });
    const error = await saveGuide(db(), editor, created.id, 1, stale).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SaveConflictError);
    expect((error as SaveConflictError).submitted.title).toBe("Stale conflict title here");
    const [guide] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.title).toBe("Newer conflict title here");
    expect(guide?.version).toBe(2);
    expect(await audits(db(), "guide.save_conflict")).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: created.id })]),
    );
  });

  it("restores by appending a revision and does not mutate the source", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const created = await createGuide(
      db(),
      editor,
      guideContent({ slug: "restore-guide", title: "Restore original title" }),
    );
    const [original] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    const before = structuredClone({
      ...original!,
      createdAt: original!.createdAt.toISOString(),
    });
    await saveGuide(
      db(),
      editor,
      created.id,
      1,
      guideContent({ slug: "restore-guide", title: "Restore edited title" }),
    );
    const restored = await restoreGuide(db(), editor, created.id, original!.id, 2);
    expect(restored.version).toBe(3);
    const revisions = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    const source = revisions.find((revision) => revision.id === original!.id);
    expect(source?.title).toBe(before.title);
    expect(source?.reason).toBe("created");
    const added = revisions.find((revision) => revision.reason === "restored");
    expect(added?.restoredFromRevisionId).toBe(original!.id);
    expect(added?.revisionNumber).toBe(3);
    const [guide] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.publishedRevisionId).toBeNull();
    expect(guide?.title).toBe("Restore original title");
    expect(await audits(db(), "guide.restored")).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: created.id })]),
    );
  });

  it("stops an author reading or changing another author's guide", async () => {
    const owner = asActor(await insertUser(db(), "author"));
    const other = asActor(await insertUser(db(), "author"));
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug: "private-draft", title: "Private draft title" }),
    );
    expect(await getEditableGuide(db(), other, created.id)).toBeNull();
    expect(await getDraftPreview(db(), other, created.id)).toBeNull();
    await expect(
      saveGuide(db(), other, created.id, 1, guideContent({ slug: "private-draft", title: "Hijacked title" })),
    ).rejects.toThrow(UserInputError);
    const [guide] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.title).toBe("Private draft title");
    const visible = await listGuides(db(), other, normaliseGuideListQuery({}));
    expect(visible.items.some((item) => item.id === created.id)).toBe(false);
    const own = await listGuides(db(), owner, normaliseGuideListQuery({ authorId: other.id }));
    expect(own.items.every((item) => item.authorId === owner.id)).toBe(true);
  });

  it("paginates in the database and escapes search wildcards", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    await createGuide(db(), editor, guideContent({ slug: "page-one", title: "Page one title" }));
    await createGuide(db(), editor, guideContent({ slug: "page-two", title: "Page two title" }));
    await createGuide(
      db(),
      editor,
      guideContent({ slug: "percent-literal", title: "Percent literal title" }),
    );
    const page = await listGuides(
      db(),
      editor,
      normaliseGuideListQuery({ q: "page-", page: "1", pageSize: "1" }),
    );
    expect(page.pageSize).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(2);
    const wildcard = await listGuides(db(), editor, normaliseGuideListQuery({ q: "%" }));
    expect(wildcard.items.some((item) => item.slug === "page-one")).toBe(false);
    const clamped = normaliseGuideListQuery({ pageSize: "5000" });
    expect(clamped.pageSize).toBe(50);
  });

  it("clears an approval when a material edit is saved", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const created = await createGuide(db(), editor, guideContent({ slug: "approval-guide" }));
    const [current] = await db().select().from(guides).where(eq(guides.id, created.id));
    await db()
      .update(guides)
      .set({ reviewState: "approved", approvedContentHash: current!.contentHash })
      .where(eq(guides.id, created.id));
    await saveGuide(
      db(),
      editor,
      created.id,
      1,
      guideContent({
        slug: "approval-guide",
        excerpt: "A different summary for the approval test, still short.",
      }),
    );
    const [guide] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.reviewState).toBe("not_requested");
    expect(guide?.approvedContentHash).toBeNull();
    expect(guide?.publishedRevisionId).toBeNull();
    expect(await audits(db(), "guide.review_invalidated")).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: created.id })]),
    );
  });
});

describe("draft preview and deletion", () => {
  it("previews the working copy without touching publication, search or the sitemap", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const seeded = await insertGuide(
      db(),
      editor.id,
      { slug: "preview-published", body: guideContent().body },
      { published: true },
    );
    const marker = "quartzbadger";
    await saveGuide(
      db(),
      editor,
      seeded.guide.id,
      1,
      guideContent({ slug: "preview-published", body: `${guideContent().body}\n\n${marker}` }),
    );
    const before = (await db().select().from(guides).where(eq(guides.id, seeded.guide.id)))[0]!;
    const preview = await getDraftPreview(db(), editor, seeded.guide.id);
    expect(preview?.body).toContain(marker);
    const published = await getPublishedGuide(db(), "preview-published");
    expect(published?.body).not.toContain(marker);
    expect(await searchPublishedGuides(db(), marker)).toEqual([]);
    const after = (await db().select().from(guides).where(eq(guides.id, seeded.guide.id)))[0]!;
    expect(after.publishedAt?.getTime()).toBe(before.publishedAt?.getTime());
    expect(after.publishedRevisionId).toBe(before.publishedRevisionId);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    const draft = await createGuide(db(), editor, guideContent({ slug: "sitemap-draft-only" }));
    const sitemap = await listSitemapGuides(db());
    expect(sitemap.some((entry) => entry.slug === "sitemap-draft-only")).toBe(false);
    expect(await getDraftPreview(db(), editor, draft.id)).not.toBeNull();
  });

  it("deletes only a never-published draft and keeps media", async () => {
    const author = asActor(await insertUser(db(), "author"));
    const editor = asActor(await insertUser(db(), "editor"));
    const created = await createGuide(db(), author, guideContent({ slug: "deletable-draft" }));
    await expect(deleteGuide(db(), author, created.id)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteGuide(db(), editor, created.id);
    expect(await db().select().from(guides).where(eq(guides.id, created.id))).toHaveLength(0);
    expect(
      await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id)),
    ).toHaveLength(0);
    expect(await audits(db(), "guide.deleted")).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: created.id })]),
    );

    const published = await insertGuide(
      db(),
      editor.id,
      { slug: "cannot-delete-published" },
      { published: true },
    );
    await expect(deleteGuide(db(), editor, published.guide.id)).rejects.toBeInstanceOf(UserInputError);
    expect(await db().select().from(guides).where(eq(guides.id, published.guide.id))).toHaveLength(1);
    expect((await getEditableGuide(db(), editor, published.guide.id))?.deletable).toBe(false);
  });

  it("deletes an article once it has been unpublished, with its revisions", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const author = asActor(await insertUser(db(), "author"));
    const { guide, revision } = await insertGuide(
      db(),
      editor.id,
      { slug: "unpublished-then-deleted", title: "Unpublished then deleted" },
      { published: true },
    );
    await unpublishGuide(db(), editor, {
      guideId: guide.id,
      publishedRevisionId: revision.id,
      reason: "Replaced by a newer guide.",
      confirmed: true,
    });
    const editable = await getEditableGuide(db(), editor, guide.id);
    expect(editable).toMatchObject({ everPublished: true, deletable: true });
    expect((await getEditableGuide(db(), author, guide.id))?.deletable).not.toBe(true);

    await deleteGuide(db(), editor, guide.id);
    expect(await db().select().from(guides).where(eq(guides.id, guide.id))).toHaveLength(0);
    expect(await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, guide.id))).toHaveLength(
      0,
    );
    expect(await audits(db(), "guide.deleted")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: guide.id,
          details: expect.objectContaining({ title: "Unpublished then deleted", everPublished: true }),
        }),
      ]),
    );
  });
});

describe("content hash stays aligned with saved guides", () => {
  it("stores the canonical hash", async () => {
    const editor = asActor(await insertUser(db(), "editor"));
    const content = guideContent({ slug: "hashed-guide" });
    const created = await createGuide(db(), editor, content);
    const [guide] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.contentHash).toBe(guideContentHash(content));
  });
});
