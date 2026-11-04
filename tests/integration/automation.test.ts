import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  guideRevisions,
  guides,
  products,
  subcategories,
  subcategoryGroups,
  users,
} from "@/db/schema";
import {
  authenticateAutomation,
  automationCatalog,
  AutomationError,
  createGuideFromAutomation,
} from "@/server/automation";
import type { Actor } from "@/server/auth/permissions";
import { publishableBody } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

const KEY = "k".repeat(40);

let t: TestDb;
let author: Actor;
let groupSlug: string;

function envFor(email: string) {
  return { AUTOMATION_API_KEY: KEY, AUTOMATION_USER_EMAIL: email };
}

function article(overrides: Record<string, unknown> = {}) {
  return {
    title: "Pantry shelf ideas for small Indian kitchens",
    excerpt:
      "Practical shelf ideas that keep dals, spices and oil within reach in a compact Indian kitchen without drilling new holes.",
    body: publishableBody(),
    category: "small-apartments",
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<AutomationError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AutomationError);
  return error as AutomationError;
}

beforeAll(async () => {
  t = await createTestDb();
  const user = await insertUser(t.db, "author");
  author = { id: user.id, role: user.role, name: user.name, email: user.email };
  const [group] = await t.db
    .select({ slug: subcategoryGroups.slug })
    .from(subcategoryGroups)
    .where(eq(subcategoryGroups.category, "small-apartments"))
    .orderBy(asc(subcategoryGroups.position))
    .limit(1);
  groupSlug = group!.slug;
  await t.db.insert(products).values({
    slug: "wall-rack",
    name: "Wall rack",
    summary: "S",
    createdBy: user.id,
    updatedBy: user.id,
  });
});

afterAll(async () => {
  await t.close();
});

describe("automation authentication", () => {
  it("is switched off unless a long key and a user are configured", async () => {
    expect((await failure(authenticateAutomation(t.db, `Bearer ${KEY}`, {}))).status).toBe(404);
    const shortKey = { AUTOMATION_API_KEY: "short", AUTOMATION_USER_EMAIL: author.email };
    expect((await failure(authenticateAutomation(t.db, "Bearer short", shortKey))).status).toBe(404);
  });

  it("rejects a missing or wrong key", async () => {
    const env = envFor(author.email);
    expect((await failure(authenticateAutomation(t.db, null, env))).status).toBe(401);
    expect((await failure(authenticateAutomation(t.db, `Bearer ${"x".repeat(40)}`, env))).status).toBe(401);
  });

  it("acts as the configured user, and refuses a disabled or unknown one", async () => {
    const actor = await authenticateAutomation(t.db, `Bearer ${KEY}`, envFor(author.email.toUpperCase()));
    expect(actor).toMatchObject({ id: author.id, role: "author" });

    expect(
      (await failure(authenticateAutomation(t.db, `Bearer ${KEY}`, envFor("nobody@example.test")))).status,
    ).toBe(403);
    const disabled = await insertUser(t.db, "author");
    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, disabled.id));
    expect(
      (await failure(authenticateAutomation(t.db, `Bearer ${KEY}`, envFor(disabled.email)))).status,
    ).toBe(403);
  });
});

describe("creating drafts from automation", () => {
  it("creates an unpublished draft from names, with an address taken from the title", async () => {
    const created = await createGuideFromAutomation(
      t.db,
      author,
      article({
        subcategory: groupSlug,
        topics: ["no-drill"],
        products: [{ slug: "wall-rack", note: "Fits above the counter." }],
        faqs: [{ question: "Do I need to drill?", answer: "No." }],
        seoTitle: "Pantry shelf ideas for small kitchens",
      }),
    );
    expect(created).toMatchObject({
      slug: "pantry-shelf-ideas-for-small-indian-kitchens",
      version: 1,
      status: "draft",
    });
    expect(created.editUrl).toMatch(/\/admin\/guides\/[0-9a-f-]{36}$/);

    const [row] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(row).toMatchObject({
      publishedRevisionId: null,
      createdBy: author.id,
      reviewState: "not_requested",
      featuredImageId: null,
      category: "small-apartments",
    });
    expect(row?.subcategoryGroupId).not.toBeNull();
    const [revision] = await t.db.select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    expect(revision?.topicIds).toHaveLength(1);
    expect(revision?.products).toEqual([{ productId: expect.any(String), note: "Fits above the counter." }]);
    const [event] = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, created.id));
    expect(event).toMatchObject({ action: "guide.created", actorId: author.id });
  });

  it("submits the draft for review when asked", async () => {
    const created = await createGuideFromAutomation(
      t.db,
      author,
      article({ title: "Spice drawer basics for rented flats", submitForReview: true }),
    );
    expect(created.status).toBe("in_review");
    const [row] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(row?.reviewState).toBe("in_review");
    expect(row?.publishedRevisionId).toBeNull();
  });

  it("finds a renamed subcategory by its name, and files under a topic named instead", async () => {
    const [group] = await t.db
      .update(subcategoryGroups)
      .set({ name: "Storage and Shelves" })
      .where(eq(subcategoryGroups.slug, "food-and-grocery-storage"))
      .returning({ id: subcategoryGroups.id });

    const renamed = await createGuideFromAutomation(
      t.db,
      author,
      article({ title: "Storage shelf basics", category: "kitchen", subcategory: "storage-and-shelves" }),
    );
    const [byName] = await t.db.select().from(guides).where(eq(guides.id, renamed.id));
    expect(byName).toMatchObject({ subcategoryGroupId: group!.id, subcategoryId: null });

    const topic = await createGuideFromAutomation(
      t.db,
      author,
      article({ title: "Plate rack basics", category: "kitchen", subcategory: "Plates, Bowls and Servingware" }),
    );
    const [byTopic] = await t.db.select().from(guides).where(eq(guides.id, topic.id));
    const bedroom = await createGuideFromAutomation(
      t.db,
      author,
      article({ title: "Under-bed storage basics", category: "bedroom-and-wardrobe" }),
    );
    const [byCategoryName] = await t.db.select().from(guides).where(eq(guides.id, bedroom.id));
    expect(byCategoryName?.category).toBe("bedroom-wardrobe");
    const [plates] = await t.db
      .select({ id: subcategories.id, groupId: subcategories.groupId })
      .from(subcategories)
      .where(eq(subcategories.slug, "plates-bowls-and-servingware"));
    expect(byTopic).toMatchObject({ subcategoryGroupId: plates!.groupId, subcategoryId: plates!.id });
  });

  it("reports every name it cannot find", async () => {
    const error = await failure(
      createGuideFromAutomation(
        t.db,
        author,
        article({
          subcategory: "no-such-group",
          topics: ["no-drill", "made-up"],
          products: [{ slug: "nope" }],
        }),
      ),
    );
    expect(error.status).toBe(422);
    expect(error.fieldErrors.subcategory).toMatch(
      /^Unknown subcategory "no-such-group" in small-apartments\. Use one of: .+, or one of their topics\.$/,
    );
    expect(error.fieldErrors).toMatchObject({
      topics: "Unknown topics: made-up.",
      products: "Unknown products: nope.",
    });
    expect(
      (await failure(createGuideFromAutomation(t.db, author, article({ category: "garage" })))).fieldErrors
        .category,
    ).toMatch(/Unknown category "garage"/);
  });

  it("rejects image fields and other unknown keys", async () => {
    const error = await failure(
      createGuideFromAutomation(t.db, author, article({ featuredImageId: "abc", image: "x.jpg" })),
    );
    expect(error.status).toBe(422);
  });

  it("passes on the editor's own checks, and refuses an address that is taken", async () => {
    const tooShort = await failure(createGuideFromAutomation(t.db, author, article({ title: "Hi" })));
    expect(tooShort.status).toBe(422);
    expect(tooShort.fieldErrors.title).toMatch(/at least/);

    const taken = await failure(
      createGuideFromAutomation(
        t.db,
        author,
        article({ slug: "pantry-shelf-ideas-for-small-indian-kitchens" }),
      ),
    );
    expect(taken.status).toBe(409);
  });
});

describe("automation catalog", () => {
  it("lists the names the endpoint accepts", async () => {
    const catalog = await automationCatalog(t.db);
    expect(catalog.categories.map((category) => category.slug)).toContain("small-apartments");
    expect(
      catalog.categories
        .find((category) => category.slug === "small-apartments")
        ?.subcategories.map((s) => s.slug),
    ).toContain(groupSlug);
    expect(catalog.topics.map((topic) => topic.slug)).toContain("no-drill");
    expect(catalog.products).toEqual([{ slug: "wall-rack", name: "Wall rack", status: "draft" }]);
  });
});
