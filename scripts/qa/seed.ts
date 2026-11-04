/**
 * Seeds SYNTHETIC content into the disposable local QA database only (tidynest_cms_qa).
 * This content exists solely to exercise layouts and workflows; it is never shipped.
 *
 *   DATABASE_URL=postgresql://qa@localhost:54329/tidynest_cms_qa npm run qa:seed
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assertDatabaseTarget } from "../../src/db/config";
import * as schema from "../../src/db/schema";
import { ARTICLE_IMAGE_DEFAULTS } from "../../src/lib/content/article-image-style";
import { FEATURED_IMAGE_DEFAULTS } from "../../src/lib/content/featured-image-style";
import { guideContentHash } from "../../src/lib/content/content-hash";
import type { GuideContent } from "../../src/lib/content/guide-schema";
import { hashPassword } from "../../src/server/auth/password";

const { guides, guideRevisions, mediaAssets, products, topics, users } = schema;

/** Minimal solid-colour PNG encoder, so QA has a real image without extra dependencies. */
function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

const para = () => `${LOREM} ${LOREM}`;

function body(topic: string): string {
  return [
    `## Why ${topic} matters in a small home`,
    para(),
    `## A simple way to start`,
    para(),
    "- Clear one shelf at a time\n- Keep daily items within reach\n- Store heavy things low",
    `### Check before you buy`,
    para(),
    `## Keeping it tidy`,
    para(),
    "> Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  ].join("\n\n");
}

async function main() {
  assertDatabaseTarget(process.env.DATABASE_URL, ["qa"]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });
  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "qa-owner@example.test"));
    if (existing.length) {
      console.log("QA data already present.");
      return;
    }
    const passwordHash = await hashPassword("qa-password-not-secret");
    const [owner] = await db
      .insert(users)
      .values([
        { email: "qa-owner@example.test", name: "QA Owner", role: "owner", passwordHash },
        { email: "qa-editor@example.test", name: "QA Editor", role: "editor", passwordHash },
        { email: "qa-author@example.test", name: "QA Author", role: "author", passwordHash },
      ])
      .returning();
    const topicRows = await db.select().from(topics);
    const topicId = (slug: string) => topicRows.find((topic) => topic.slug === slug)!.id;

    const png = solidPng(1200, 750, [232, 236, 226]);
    const [image] = await db
      .insert(mediaAssets)
      .values({
        filename: "sage-placeholder.png",
        contentType: "image/png",
        byteSize: png.byteLength,
        width: 1200,
        height: 750,
        sha256: createHash("sha256").update(png).digest("hex"),
        data: png,
        altText: "Plain pale sage placeholder image",
        uploadedBy: owner!.id,
      })
      .returning();

    const [product] = await db
      .insert(products)
      .values({
        slug: "sample-rack",
        name: "Sample rack",
        brand: "Example Brand",
        summary: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
        merchantName: "Example Shop",
        productUrl: "https://shop.example.test/sample-rack",
        verifiedOn: "2026-10-13",
        status: "active",
        createdBy: owner!.id,
        updatedBy: owner!.id,
      })
      .returning();

    const items: Array<{ content: GuideContent; published: boolean; daysAgo: number }> = [
      ["Spice storage for a compact kitchen", "kitchen", ["no-drill", "space-saving"], true, 1, true],
      ["Cabinet order without renovation", "kitchen", ["budget"], true, 3, false],
      ["Hooks and shelves for a wet bathroom", "bathroom", ["no-drill"], true, 5, false],
      ["Saree storage in a steel almirah", "bedroom-wardrobe", ["space-saving"], true, 8, false],
      ["Renter-friendly entryway", "renters", ["renter-friendly", "no-drill"], true, 12, false],
      ["Unpublished draft that must stay hidden", "kitchen", [], false, 0, false],
    ].map(([title, category, topicSlugs, published, daysAgo, withExtras]) => {
      const slug = String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return {
        published: Boolean(published),
        daysAgo: Number(daysAgo),
        content: {
          title: String(title),
          slug,
          excerpt:
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
          body: body(String(title).toLowerCase()),
          closing: "",
          category: category as GuideContent["category"],
          subcategoryId: null,
          subcategoryGroupId: null,
          topicIds: (topicSlugs as string[]).map(topicId),
          products: withExtras ? [{ productId: product!.id, note: "Lorem ipsum dolor sit amet." }] : [],
          seoTitle: null,
          seoDescription: null,
          featuredImageId: withExtras ? image!.id : null,
          featuredImageAlt: null,
          faqs: [],
          articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
          featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
        },
      };
    });

    for (const item of items) {
      const hash = guideContentHash(item.content);
      const when = new Date(Date.now() - item.daysAgo * 86_400_000);
      await db.transaction(async (tx) => {
        const c = item.content;
        const [guide] = await tx
          .insert(guides)
          .values({ ...c, contentHash: hash, createdBy: owner!.id, updatedBy: owner!.id })
          .returning();
        const [revision] = await tx
          .insert(guideRevisions)
          .values({
            ...c,
            guideId: guide!.id,
            revisionNumber: 1,
            contentHash: hash,
            reason: "created",
            createdBy: owner!.id,
          })
          .returning();
        await tx
          .update(guides)
          .set({
            currentRevisionId: revision!.id,
            ...(item.published
              ? {
                  publishedRevisionId: revision!.id,
                  publishedAt: when,
                  firstPublishedAt: when,
                  reviewState: "approved" as const,
                  approvedContentHash: hash,
                }
              : {}),
          })
          .where(eq(guides.id, guide!.id));
        if (c.topicIds.length) {
          await tx.execute(
            sql`insert into guide_topics (guide_id, topic_id) select ${guide!.id}, unnest(${sql.param(c.topicIds)}::uuid[])`,
          );
        }
        if (c.products.length) {
          await tx.execute(
            sql`insert into guide_products (guide_id, product_id, position, note) values (${guide!.id}, ${c.products[0]!.productId}, 0, ${c.products[0]!.note})`,
          );
        }
      });
    }
    console.log("Seeded synthetic QA data (users: qa-owner / qa-editor / qa-author @example.test).");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "QA seed failed.");
  process.exit(1);
});
