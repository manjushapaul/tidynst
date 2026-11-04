import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guides, mediaAssets, products, subcategoryGroups, topics, users } from "@/db/schema";
import {
  articleTopics,
  countPublishedGuides,
  getPublishedGuide,
  listPublishedGuides,
  listSitemapGuides,
  listTopics,
  normaliseSearchQuery,
  relatedGuides,
  searchPublishedGuides,
} from "@/server/public-content";
import { createTestDb, type TestDb } from "../support/test-db";
import { insertGuide, insertUser } from "../support/seed";

let t: TestDb;
let noDrillId: string;

beforeAll(async () => {
  t = await createTestDb();
  const user = await insertUser(t.db);
  const [topic] = await t.db.select().from(topics).where(eq(topics.slug, "no-drill"));
  noDrillId = topic!.id;

  const [product] = await t.db
    .insert(products)
    .values([
      {
        slug: "active-rack",
        name: "Active rack",
        summary: "S",
        status: "active",
        verifiedOn: "2026-10-01",
        createdBy: user.id,
        updatedBy: user.id,
      },
      { slug: "draft-rack", name: "Draft rack", summary: "S", createdBy: user.id, updatedBy: user.id },
    ])
    .returning();
  const [, draftProduct] = await t.db.select().from(products).orderBy(products.slug);

  await insertGuide(
    t.db,
    user.id,
    {
      slug: "kitchen-spice-storage",
      title: "Spice storage for small kitchens",
      topicIds: [noDrillId],
      products: [
        { productId: product!.id, note: "Fits a narrow shelf." },
        { productId: draftProduct!.id, note: null },
      ],
    },
    { published: true, publishedAt: new Date("2026-10-01T00:00:00Z") },
  );
  await insertGuide(
    t.db,
    user.id,
    {
      slug: "kitchen-cabinet-order",
      title: "Bringing order to kitchen cabinets",
      body: "## Cabinets\n\nShelf risers and labelled containers.",
    },
    { published: true, publishedAt: new Date("2026-10-05T00:00:00Z") },
  );
  await insertGuide(
    t.db,
    user.id,
    { slug: "bathroom-hooks", title: "Hooks for a wet bathroom", category: "bathroom" },
    {
      published: true,
      publishedAt: new Date("2026-10-03T00:00:00Z"),
    },
  );
  await insertGuide(t.db, user.id, {
    slug: "secret-draft",
    title: "An unpublished kitchen draft about spices",
  });
});

afterAll(async () => {
  await t.close();
});

describe("public content queries", () => {
  it("lists only published guides, newest first", async () => {
    const list = await listPublishedGuides(t.db, { limit: 10 });
    expect(list.map((guide) => guide.slug)).toEqual([
      "kitchen-cabinet-order",
      "bathroom-hooks",
      "kitchen-spice-storage",
    ]);
    expect(await countPublishedGuides(t.db)).toBe(3);
  });

  it("filters by category and topic", async () => {
    expect((await listPublishedGuides(t.db, { category: "kitchen", limit: 10 })).map((g) => g.slug)).toEqual([
      "kitchen-cabinet-order",
      "kitchen-spice-storage",
    ]);
    expect((await listPublishedGuides(t.db, { topicId: noDrillId, limit: 10 })).map((g) => g.slug)).toEqual([
      "kitchen-spice-storage",
    ]);
    expect(await countPublishedGuides(t.db, { category: "renters" })).toBe(0);
  });

  it("never returns drafts by slug, in search or in the sitemap", async () => {
    expect(await getPublishedGuide(t.db, "secret-draft")).toBeNull();
    expect((await searchPublishedGuides(t.db, "unpublished")).length).toBe(0);
    expect((await listSitemapGuides(t.db)).map((g) => g.slug)).not.toContain("secret-draft");
  });

  it("serves the published revision, not later unpublished edits to the working copy", async () => {
    await t.db
      .update(guides)
      .set({ title: "Edited but not published" })
      .where(eq(guides.slug, "kitchen-spice-storage"));
    const guide = await getPublishedGuide(t.db, "kitchen-spice-storage");
    expect(guide?.title).toBe("Spice storage for small kitchens");
  });

  it("includes only active products, in the recommended order, and the guide's topics", async () => {
    const guide = await getPublishedGuide(t.db, "kitchen-spice-storage");
    expect(guide?.products.map((p) => [p.name, p.note])).toEqual([["Active rack", "Fits a narrow shelf."]]);
    expect(guide?.topics.map((topic) => topic.slug)).toEqual(["no-drill"]);
  });

  it("finds published guides with English full-text search, ranking title matches first", async () => {
    const results = await searchPublishedGuides(t.db, "cabinets");
    expect(results[0]?.slug).toBe("kitchen-cabinet-order");
    expect(await searchPublishedGuides(t.db, "spice OR hooks")).toHaveLength(2);
  });

  it("uses the category page sections as an article's topics", async () => {
    const groups = await t.db
      .select({ name: subcategoryGroups.name })
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.category, "small-apartments"))
      .orderBy(asc(subcategoryGroups.position), asc(subcategoryGroups.name));
    expect((await articleTopics(t.db, "small-apartments")).map((topic) => topic.name)).toEqual(
      groups.map((group) => group.name),
    );
    expect((await articleTopics(t.db, "bathroom")).map((topic) => topic.name)).toEqual([
      "Shelves and corner storage",
      "Hooks and towel space",
      "Wet-area considerations",
      "Toiletries and cleaning supplies",
    ]);
    expect(await articleTopics(t.db, null)).toEqual([]);
  });

  it("relates guides in the same category first", async () => {
    const guide = await getPublishedGuide(t.db, "kitchen-spice-storage");
    const related = await relatedGuides(t.db, guide!);
    expect(related.map((g) => g.slug)).toEqual(["kitchen-cabinet-order"]);
  });

  it("relates an uncategorised draft preview by shared topic, or not at all", async () => {
    expect(
      (await relatedGuides(t.db, { slug: "secret-draft", category: null, topicIds: [noDrillId] })).map(
        (g) => g.slug,
      ),
    ).toEqual(["kitchen-spice-storage"]);
    expect(await relatedGuides(t.db, { slug: "secret-draft", category: null, topicIds: [] })).toEqual([]);
  });

  it("counts published guides per topic", async () => {
    const counts = Object.fromEntries(
      (await listTopics(t.db)).map((topic) => [topic.slug, topic.guideCount]),
    );
    expect(counts["no-drill"]).toBe(1);
    expect(counts["budget"]).toBe(0);
  });
});

describe("body images", () => {
  it("lists body images in the sitemap and gives the article their sizes", async () => {
    const [owner] = await t.db.select().from(users).limit(1);
    const [photo] = await t.db
      .insert(mediaAssets)
      .values({
        filename: "shelf photo.jpg",
        contentType: "image/jpeg",
        byteSize: 80,
        width: 1600,
        height: 1200,
        sha256: "body-image-sha",
        data: Buffer.from("photo"),
        altText: "Shelf",
        uploadedBy: owner!.id,
        variants: [
          {
            label: "md",
            width: 800,
            height: 600,
            byteSize: 40,
            contentType: "image/webp",
            filename: "shelf-photo-800.webp",
            storageKey: "k",
            storageUrl: "https://blob.example/k",
          },
        ],
      })
      .returning();
    const master = `/media/${photo!.id}/shelf%20photo.jpg`;
    const variant = `/media/${photo!.id}/shelf-photo-800.webp`;
    const missing = "/media/00000000-0000-4000-8000-000000000000/gone.jpg";
    await insertGuide(
      t.db,
      owner!.id,
      {
        slug: "renters-shelf-photos",
        category: "renters",
        body: [
          `## Shelves\n\n![Shelf](${variant}#width=50)`,
          `![Shelf](${master} "Caption")`,
          `![Gone](${missing})`,
          `A [plain link](${master}) is not an image.`,
          `![Shelf again](${variant})`,
        ].join("\n\n"),
      },
      { published: true },
    );

    const entry = (await listSitemapGuides(t.db)).find((guide) => guide.slug === "renters-shelf-photos");
    expect(entry?.images).toEqual([variant, master]);

    const guide = await getPublishedGuide(t.db, "renters-shelf-photos");
    expect(guide?.bodyImageSizes).toEqual({
      [`${photo!.id}/shelf photo.jpg`]: { width: 1600, height: 1200 },
      [`${photo!.id}/shelf-photo-800.webp`]: { width: 800, height: 600 },
    });
  });
});

describe("search query normalisation", () => {
  it("trims, collapses whitespace, bounds length and rejects tiny queries", () => {
    expect(normaliseSearchQuery("  spice   racks ")).toBe("spice racks");
    expect(normaliseSearchQuery("a")).toBeNull();
    expect(normaliseSearchQuery(["x"])).toBeNull();
    expect(normaliseSearchQuery("x".repeat(500))?.length).toBe(100);
  });
});
