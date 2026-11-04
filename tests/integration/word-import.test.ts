import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guideRevisions, guides, mediaAssets, subcategoryGroups } from "@/db/schema";
import { parseArticleBatch } from "@/lib/import/article-batch";
import type { Actor } from "@/server/auth/permissions";
import { applyWordImport, planWordImport } from "@/server/word-import";
import { templateArticle } from "../support/docx";
import { insertGuide, insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
let editor: Actor;
let groupSlug: string;
const options = { submitForReview: false };

function batch(...articles: string[][]) {
  return parseArticleBatch(articles.flat());
}

async function row(title: string) {
  const [guide] = await t.db.select().from(guides).where(eq(guides.title, title));
  return guide!;
}

beforeAll(async () => {
  t = await createTestDb();
  const user = await insertUser(t.db, "editor");
  editor = { id: user.id, role: user.role, name: user.name, email: user.email };
  const [group] = await t.db
    .select({ slug: subcategoryGroups.slug })
    .from(subcategoryGroups)
    .where(eq(subcategoryGroups.category, "kitchen"))
    .orderBy(asc(subcategoryGroups.position))
    .limit(1);
  groupSlug = group!.slug;
});

afterAll(async () => {
  await t.close();
});

describe("Word import", () => {
  it("previews without changing anything, then creates new drafts", async () => {
    const doc = batch(
      templateArticle({
        title: "Spice and dabba storage ideas",
        slug: "spice-and-dabba-storage-ideas",
        subcategory: groupSlug,
        topics: "[no-drill]",
        body: "Intro.\n\n## Plan Around Cooking\n\nText.",
      }),
      templateArticle({ title: "Fridge and pantry organisation", body: "Intro.\n\n## Zones\n\nText." }),
    );
    const plan = await planWordImport(t.db, editor, doc, options);
    expect(plan.map((item) => [item.title, item.action, item.problems])).toEqual([
      ["Spice and dabba storage ideas", "create", []],
      ["Fridge and pantry organisation", "create", []],
    ]);
    expect(await t.db.select().from(guides)).toHaveLength(0);

    const results = await applyWordImport(t.db, editor, doc, options);
    expect(results.map((item) => item.outcome)).toEqual(["created", "created"]);
    const spice = await row("Spice and dabba storage ideas");
    expect(spice).toMatchObject({
      slug: "spice-and-dabba-storage-ideas",
      category: "kitchen",
      publishedRevisionId: null,
      reviewState: "not_requested",
      createdBy: editor.id,
    });
    expect(spice.subcategoryGroupId).not.toBeNull();
    expect(spice.faqs).toEqual([{ question: "Is this a test?", answer: "Yes." }]);
    expect((await row("Fridge and pantry organisation")).slug).toBe("fridge-and-pantry-organisation");
  });

  it("updates an article with the same title, keeping images added in the editor", async () => {
    const [asset] = await t.db
      .insert(mediaAssets)
      .values({
        filename: "shelf.png",
        contentType: "image/png",
        byteSize: 10,
        width: 800,
        height: 600,
        sha256: "word-import-shelf",
        data: Buffer.from("x"),
        altText: "Shelf",
        uploadedBy: editor.id,
      })
      .returning();
    const image = `![Spice shelf](/media/${asset!.id}/shelf.png)`;
    const before = await row("Spice and dabba storage ideas");
    await t.db
      .update(guides)
      .set({ body: `Intro.\n\n## Plan Around Cooking\n\n${image}\n\nText.`, featuredImageId: asset!.id })
      .where(eq(guides.id, before.id));

    const doc = batch(
      templateArticle({
        title: "Spice and Dabba Storage Ideas",
        slug: "a-different-address",
        body: "New intro.\n\n## Plan around cooking\n\nRewritten text.",
      }),
    );
    const [planned] = await planWordImport(t.db, editor, doc, options);
    expect(planned).toMatchObject({ action: "update", guideId: before.id });
    expect(planned?.notes).toEqual(
      expect.arrayContaining([
        "Keeps 1 image already added in the editor.",
        "Keeps the featured image.",
        'Keeps its address "spice-and-dabba-storage-ideas" (the document says "a-different-address").',
        "Keeps its topics (none listed).",
      ]),
    );

    const [result] = await applyWordImport(t.db, editor, doc, options);
    expect(result?.outcome).toBe("updated");
    const after = await row("Spice and Dabba Storage Ideas");
    expect(after.id).toBe(before.id);
    expect(after.slug).toBe("spice-and-dabba-storage-ideas");
    expect(after.featuredImageId).toBe(asset!.id);
    expect(after.body).toBe(`New intro.\n\n## Plan around cooking\n\n${image}\n\nRewritten text.`);
    expect(after.version).toBe(before.version + 1);
    const revisions = await t.db.select().from(guideRevisions).where(eq(guideRevisions.guideId, before.id));
    expect(revisions.length).toBeGreaterThanOrEqual(2);

    const [again] = await applyWordImport(t.db, editor, doc, options);
    expect(again?.outcome).toBe("unchanged");
  });

  it("saves updates to a published article as a draft and leaves the live version alone", async () => {
    await insertGuide(
      t.db,
      editor.id,
      { title: "Groceries and grains storage", slug: "groceries-and-grains-storage" },
      { published: true },
    );
    const before = await row("Groceries and grains storage");
    const doc = batch(templateArticle({ title: "Groceries and grains storage", body: "Updated body text." }));
    const [planned] = await planWordImport(t.db, editor, doc, options);
    expect(planned).toMatchObject({ action: "update", published: true });
    expect(planned?.notes[0]).toBe("Published: the live article stays as it is until you republish it.");

    await applyWordImport(t.db, editor, doc, options);
    const after = await row("Groceries and grains storage");
    expect(after.body).toBe("Updated body text.");
    expect(after.publishedRevisionId).toBe(before.publishedRevisionId);
    const [published] = await t.db
      .select({ body: guideRevisions.body })
      .from(guideRevisions)
      .where(eq(guideRevisions.id, before.publishedRevisionId!));
    expect(published?.body).toBe(before.body);
  });

  it("skips articles with unknown names, a taken address or invalid fields, and imports the rest", async () => {
    const doc = batch(
      templateArticle({ title: "Unknown subcategory article", subcategory: "no-such-group", body: "Text." }),
      templateArticle({
        title: "Another spice article",
        slug: "spice-and-dabba-storage-ideas",
        body: "Text.",
      }),
      templateArticle({ title: "Hi", body: "Too short a title." }),
      templateArticle({ title: "Cutlery drawer basics", body: "Text." }),
    );
    const results = await applyWordImport(t.db, editor, doc, options);
    expect(results.map((item) => [item.outcome, item.message])).toEqual([
      [
        "skipped",
        expect.stringMatching(/^Unknown subcategory "no-such-group" in kitchen\. Use one of: Food and Grocery Storage, /),
      ],
      [
        "skipped",
        'The address "spice-and-dabba-storage-ideas" is already used by "Spice and Dabba Storage Ideas".',
      ],
      ["skipped", "Title must be at least 3 characters."],
      ["created", null],
    ]);
  });

  it("refuses to guess when several articles share a title", async () => {
    await insertGuide(t.db, editor.id, { title: "Duplicate title", slug: "duplicate-title-one" });
    await insertGuide(t.db, editor.id, { title: "Duplicate title", slug: "duplicate-title-two" });
    const [planned] = await planWordImport(
      t.db,
      editor,
      batch(templateArticle({ title: "Duplicate title", body: "Text." })),
      options,
    );
    expect(planned).toMatchObject({ action: "skip" });
    expect(planned?.problems[0]).toMatch(/2 articles already have this title/);
  });

  it("submits imported drafts for review when asked", async () => {
    const [result] = await applyWordImport(
      t.db,
      editor,
      batch(templateArticle({ title: "Rice storage for monsoon", body: "Text." })),
      { submitForReview: true },
    );
    expect(result).toMatchObject({ outcome: "created", inReview: true, message: null });
    expect((await row("Rice storage for monsoon")).reviewState).toBe("in_review");
  });
});
