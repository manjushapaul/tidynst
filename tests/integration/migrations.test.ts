import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guides, products, topics, users } from "@/db/schema";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
let userId: string;

beforeAll(async () => {
  t = await createTestDb();
  const [user] = await t.db
    .insert(users)
    .values({ email: "owner@example.test", name: "Owner", role: "owner", passwordHash: "x" })
    .returning();
  userId = user!.id;
});

afterAll(async () => {
  await t.close();
});

async function rejects(promise: Promise<unknown>, constraint: string) {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    const text = `${String(error)} ${String((error as { cause?: unknown }).cause ?? "")}`;
    return text.includes(constraint);
  });
}

describe("migrations on an isolated database", () => {
  it("creates every table", async () => {
    const result = await t.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "audit_events",
      "contact_messages",
      "contact_replies",
      "guide_products",
      "guide_reviews",
      "guide_revisions",
      "guide_topics",
      "guides",
      "homepage_settings",
      "media_assets",
      "page_views",
      "password_reset_tokens",
      "products",
      "rate_limit_events",
      "sessions",
      "subcategories",
      "subcategory_groups",
      "topics",
      "users",
    ]);
  });

  it("seeds the initial topics as tags, not categories", async () => {
    const rows = await t.db.select({ slug: topics.slug }).from(topics).orderBy(topics.slug);
    expect(rows.map((row) => row.slug)).toEqual([
      "budget",
      "decluttering",
      "no-drill",
      "renter-friendly",
      "space-saving",
      "vertical-storage",
    ]);
  });

  it("supports English full-text search", async () => {
    const result = await t.client.query<{ match: boolean }>(
      "select to_tsvector('english', 'Organising small kitchens') @@ websearch_to_tsquery('english', 'kitchen organise') as match",
    );
    expect(result.rows[0]?.match).toBe(true);
  });
});

describe("constraints", () => {
  it("enforces lowercase, unique user emails", async () => {
    await rejects(
      t.db
        .insert(users)
        .values({ email: "Mixed@Example.test", name: "X", role: "author", passwordHash: "x" }),
      "users_email_lowercase",
    );
    await rejects(
      t.db
        .insert(users)
        .values({ email: "owner@example.test", name: "X", role: "author", passwordHash: "x" }),
      "users_email_key",
    );
  });

  const guide = (overrides: Partial<typeof guides.$inferInsert> = {}) => ({
    slug: "a-guide",
    title: "A guide",
    contentHash: "h",
    createdBy: userId,
    updatedBy: userId,
    ...overrides,
  });

  it("enforces guide slug format and uniqueness", async () => {
    await rejects(t.db.insert(guides).values(guide({ slug: "Bad Slug" })), "guides_slug_format");
    await t.db.insert(guides).values(guide({ slug: "unique-guide" }));
    await rejects(t.db.insert(guides).values(guide({ slug: "unique-guide" })), "guides_slug_key");
  });

  it("does not allow a category outside the five primary categories", async () => {
    await expect(
      t.db.execute(sql`insert into guides (slug, title, content_hash, created_by, updated_by, category)
        values ('x-guide', 'X guide', 'h', ${userId}, ${userId}, 'no-drill')`),
    ).rejects.toThrow();
  });

  it("keeps approval state and approved hash consistent", async () => {
    await rejects(
      t.db.insert(guides).values(guide({ slug: "approved-no-hash", reviewState: "approved" })),
      "guides_approval_consistency",
    );
    await rejects(
      t.db.insert(guides).values(guide({ slug: "hash-no-approval", approvedContentHash: "h" })),
      "guides_approval_consistency",
    );
  });

  it("cannot mark a guide published without a published revision", async () => {
    await rejects(
      t.db
        .insert(guides)
        .values(guide({ slug: "fake-published", publishedAt: new Date(), firstPublishedAt: new Date() })),
      "guides_published_consistency",
    );
  });

  it("requires a verification date before a product can be active, and https product URLs", async () => {
    const product = { slug: "p", name: "P", summary: "S", createdBy: userId, updatedBy: userId };
    await rejects(t.db.insert(products).values({ ...product, status: "active" }), "products_active_verified");
    await rejects(
      t.db.insert(products).values({ ...product, slug: "p2", productUrl: "http://shop.example" }),
      "products_url_https",
    );
    await t.db
      .insert(products)
      .values({ ...product, slug: "p3", status: "active", verifiedOn: "2026-10-13" });
  });
});
