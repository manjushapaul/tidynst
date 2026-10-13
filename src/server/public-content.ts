import "server-only";
import { and, desc, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { guideRevisions, guides, mediaAssets, products, topics } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CategorySlug } from "@/content/categories";

/**
 * Read-only queries for the public site. Every query joins guides to the revision referenced by
 * `published_revision_id`, so drafts, unpublished edits and unpublished guides are never returned.
 */

export type PublicImage = { src: string; width: number; height: number; alt: string };

export type GuideSummary = {
  slug: string;
  title: string;
  excerpt: string;
  category: CategorySlug | null;
  firstPublishedAt: Date;
  updatedAt: Date;
  readingMinutes: number;
  image: PublicImage | null;
};

export type PublicTopic = { id: string; slug: string; name: string; description: string };

export type PublicProduct = {
  id: string;
  name: string;
  brand: string | null;
  summary: string;
  merchantName: string | null;
  productUrl: string | null;
  note: string | null;
};

export type PublishedGuide = GuideSummary & {
  id: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  topicIds: string[];
  topics: PublicTopic[];
  products: PublicProduct[];
};

export function mediaPath(id: string, filename: string): string {
  return `/media/${id}/${encodeURIComponent(filename)}`;
}

const wordCount = sql<number>`coalesce(array_length(regexp_split_to_array(trim(${guideRevisions.body}), '\\s+'), 1), 0)`;

const summaryColumns = {
  slug: guideRevisions.slug,
  title: guideRevisions.title,
  excerpt: guideRevisions.excerpt,
  category: guideRevisions.category,
  firstPublishedAt: guides.firstPublishedAt,
  publishedAt: guides.publishedAt,
  words: wordCount,
  imageId: mediaAssets.id,
  imageFilename: mediaAssets.filename,
  imageWidth: mediaAssets.width,
  imageHeight: mediaAssets.height,
  imageAlt: sql<string | null>`coalesce(${guideRevisions.featuredImageAlt}, ${mediaAssets.altText})`,
};

type SummaryRow = {
  slug: string;
  title: string;
  excerpt: string;
  category: CategorySlug | null;
  firstPublishedAt: Date | null;
  publishedAt: Date | null;
  words: number;
  imageId: string | null;
  imageFilename: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAlt: string | null;
};

function toSummary(row: SummaryRow): GuideSummary {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    firstPublishedAt: row.firstPublishedAt!,
    updatedAt: row.publishedAt!,
    readingMinutes: Math.max(1, Math.round(Number(row.words) / 220)),
    image:
      row.imageId && row.imageFilename && row.imageWidth && row.imageHeight
        ? {
            src: mediaPath(row.imageId, row.imageFilename),
            width: row.imageWidth,
            height: row.imageHeight,
            alt: row.imageAlt ?? "",
          }
        : null,
  };
}

function publishedGuides(db: Db) {
  return db
    .select(summaryColumns)
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .leftJoin(mediaAssets, eq(guideRevisions.featuredImageId, mediaAssets.id));
}

export type GuideFilter = { category?: CategorySlug; topicId?: string; excludeSlug?: string };

function filterConditions(filter: GuideFilter): SQL | undefined {
  const conditions: SQL[] = [isNotNull(guides.publishedRevisionId)];
  if (filter.category) conditions.push(eq(guideRevisions.category, filter.category));
  if (filter.topicId) conditions.push(sql`${filter.topicId}::uuid = any(${guideRevisions.topicIds})`);
  if (filter.excludeSlug) conditions.push(ne(guideRevisions.slug, filter.excludeSlug));
  return and(...conditions);
}

export async function listPublishedGuides(
  db: Db,
  filter: GuideFilter & { limit: number; offset?: number },
): Promise<GuideSummary[]> {
  const rows = await publishedGuides(db)
    .where(filterConditions(filter))
    .orderBy(desc(guides.firstPublishedAt), desc(guides.id))
    .limit(filter.limit)
    .offset(filter.offset ?? 0);
  return rows.map(toSummary);
}

export async function countPublishedGuides(db: Db, filter: GuideFilter = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .where(filterConditions(filter));
  return row?.count ?? 0;
}

export async function getPublishedGuide(db: Db, slug: string): Promise<PublishedGuide | null> {
  const [row] = await db
    .select({
      ...summaryColumns,
      id: guides.id,
      body: guideRevisions.body,
      seoTitle: guideRevisions.seoTitle,
      seoDescription: guideRevisions.seoDescription,
      topicIds: guideRevisions.topicIds,
      productRefs: guideRevisions.products,
    })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .leftJoin(mediaAssets, eq(guideRevisions.featuredImageId, mediaAssets.id))
    .where(eq(guideRevisions.slug, slug))
    .limit(1);
  if (!row) return null;

  const topicRows = row.topicIds.length
    ? await db
        .select({ id: topics.id, slug: topics.slug, name: topics.name, description: topics.description })
        .from(topics)
        .where(inArray(topics.id, row.topicIds))
        .orderBy(topics.name)
    : [];

  const productIds = row.productRefs.map((ref) => ref.productId);
  const productRows = productIds.length
    ? await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          summary: products.summary,
          merchantName: products.merchantName,
          productUrl: products.productUrl,
        })
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.status, "active")))
    : [];
  const productsById = new Map(productRows.map((product) => [product.id, product]));
  const orderedProducts = row.productRefs.flatMap((ref) => {
    const product = productsById.get(ref.productId);
    return product ? [{ ...product, note: ref.note }] : [];
  });

  return {
    ...toSummary(row),
    id: row.id,
    body: row.body,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    topicIds: row.topicIds,
    topics: topicRows,
    products: orderedProducts,
  };
}

/** Same-category guides first, then guides sharing a topic, newest first. */
export async function relatedGuides(db: Db, guide: PublishedGuide, limit = 3): Promise<GuideSummary[]> {
  const sharesTopic = guide.topicIds.length
    ? sql`${guideRevisions.topicIds} && ${sql.param(guide.topicIds)}::uuid[]`
    : sql`false`;
  const sameCategory = guide.category ? sql`${guideRevisions.category} = ${guide.category}` : sql`false`;
  const rows = await publishedGuides(db)
    .where(and(ne(guideRevisions.slug, guide.slug), sql`(${sameCategory} or ${sharesTopic})`))
    .orderBy(sql`(${sameCategory}) desc`, desc(guides.firstPublishedAt))
    .limit(limit);
  return rows.map(toSummary);
}

export async function listTopics(db: Db): Promise<Array<PublicTopic & { guideCount: number }>> {
  const rows = await db
    .select({
      id: topics.id,
      slug: topics.slug,
      name: topics.name,
      description: topics.description,
      guideCount: sql<number>`(
        select count(*)::int from ${guides} g
        join ${guideRevisions} r on r.id = g.published_revision_id
        where "topics"."id" = any(r.topic_ids)
      )`,
    })
    .from(topics)
    .orderBy(topics.name);
  return rows;
}

export async function getTopic(db: Db, slug: string): Promise<PublicTopic | null> {
  const [row] = await db
    .select({ id: topics.id, slug: topics.slug, name: topics.name, description: topics.description })
    .from(topics)
    .where(eq(topics.slug, slug))
    .limit(1);
  return row ?? null;
}

export const SEARCH_QUERY_MAX = 100;

/** Trims, collapses whitespace and bounds a search query. Returns null if it is too short to search. */
export function normaliseSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const query = raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX);
  return query.length >= 2 ? query : null;
}

const searchDocument = sql`to_tsvector('english', ${guideRevisions.title} || ' ' || ${guideRevisions.excerpt} || ' ' || ${guideRevisions.body})`;

export async function searchPublishedGuides(db: Db, query: string, limit = 20): Promise<GuideSummary[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  const weighted = sql`setweight(to_tsvector('english', ${guideRevisions.title}), 'A') || setweight(to_tsvector('english', ${guideRevisions.excerpt}), 'B') || setweight(to_tsvector('english', ${guideRevisions.body}), 'C')`;
  const rows = await publishedGuides(db)
    .where(and(isNotNull(guides.publishedRevisionId), sql`${searchDocument} @@ ${tsQuery}`))
    .orderBy(sql`ts_rank(${weighted}, ${tsQuery}) desc`, desc(guides.firstPublishedAt))
    .limit(limit);
  return rows.map(toSummary);
}

export type SitemapGuide = {
  slug: string;
  category: CategorySlug | null;
  topicSlugs: string[];
  updatedAt: Date;
};

export async function listSitemapGuides(db: Db): Promise<SitemapGuide[]> {
  const rows = await db
    .select({
      slug: guideRevisions.slug,
      category: guideRevisions.category,
      topicSlugs: sql<
        string[]
      >`coalesce((select array_agg(t.slug order by t.slug) from topics t where t.id = any(${guideRevisions.topicIds})), '{}')`,
      updatedAt: guides.publishedAt,
    })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .orderBy(desc(guides.publishedAt));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt! }));
}
