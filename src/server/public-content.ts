import "server-only";
import { and, asc, desc, eq, exists, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  guideRevisions,
  guides,
  mediaAssets,
  products,
  subcategories,
  subcategoryGroups,
  topics,
  type GuideFaq,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { CategorySlug } from "@/content/categories";
import { type ArticleImageStyle, resolveArticleImageStyle } from "@/lib/content/article-image-style";
import type { BodyImageSizes, ImageSize } from "@/lib/content/body-images";
import { type FeaturedImageStyle, resolveFeaturedImageStyle } from "@/lib/content/featured-image-style";
import { bodyMediaIds } from "@/lib/content/publish-rules";
import { titleMatchesTopic } from "@/lib/content/topic-match";

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
  subcategoryId: string | null;
  subcategoryGroupId: string | null;
  body: string;
  closing: string;
  seoTitle: string | null;
  seoDescription: string | null;
  topicIds: string[];
  topics: PublicTopic[];
  products: PublicProduct[];
  faqs: GuideFaq[];
  articleImageStyle: ArticleImageStyle;
  featuredImageStyle: FeaturedImageStyle;
  bodyImageSizes: BodyImageSizes;
};

export function mediaPath(id: string, filename: string): string {
  return `/media/${id}/${encodeURIComponent(filename)}`;
}

/** Sizes of the library images a body uses, master and processed variants alike. */
export async function bodyImageSizes(db: Db, markdown: string): Promise<BodyImageSizes> {
  const ids = bodyMediaIds(markdown);
  if (!ids.length) return {};
  const rows = await db
    .select({
      id: mediaAssets.id,
      filename: mediaAssets.filename,
      width: mediaAssets.width,
      height: mediaAssets.height,
      variants: mediaAssets.variants,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, ids));
  const sizes: Record<string, ImageSize> = {};
  for (const row of rows) {
    sizes[`${row.id}/${row.filename}`] = { width: row.width, height: row.height };
    for (const variant of row.variants ?? []) {
      sizes[`${row.id}/${variant.filename}`] = { width: variant.width, height: variant.height };
    }
  }
  return sizes;
}

const wordCount = sql<number>`coalesce(array_length(regexp_split_to_array(trim(${guideRevisions.body} || ' ' || ${guideRevisions.closing}), '\\s+'), 1), 0)`;

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

export type GuideFilter = {
  category?: CategorySlug;
  subcategoryId?: string;
  /** Every article filed under this category section. */
  subcategoryGroupId?: string;
  /** Only articles not filed under one of their subcategory's topics. */
  withoutTopic?: boolean;
  topicId?: string;
  excludeSlug?: string;
};

function filterConditions(filter: GuideFilter): SQL | undefined {
  const conditions: SQL[] = [isNotNull(guides.publishedRevisionId)];
  if (filter.category) conditions.push(eq(guideRevisions.category, filter.category));
  if (filter.subcategoryId) conditions.push(eq(guideRevisions.subcategoryId, filter.subcategoryId));
  if (filter.subcategoryGroupId) {
    conditions.push(
      sql`(
        ${guideRevisions.subcategoryGroupId} = ${filter.subcategoryGroupId}
        or ${guideRevisions.subcategoryId} in (
          select ${subcategories.id} from ${subcategories} where ${subcategories.groupId} = ${filter.subcategoryGroupId}
        )
      )`,
    );
  }
  if (filter.withoutTopic) {
    conditions.push(
      sql`not exists (
        select 1 from ${subcategories}
        inner join ${subcategoryGroups} on ${subcategoryGroups.id} = ${subcategories.groupId}
        where ${subcategories.id} = ${guideRevisions.subcategoryId}
          and ${subcategories.slug} <> ${subcategoryGroups.slug}
      )`,
    );
  }
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

const TOPIC_GUIDES_MAX = 500;

/**
 * Articles for a topic page: those filed under the topic, plus articles in the same subcategory
 * with no topic of their own whose title is about the topic.
 */
export async function listTopicGuides(
  db: Db,
  topic: { id: string; name: string; groupId: string },
): Promise<GuideSummary[]> {
  const [filed, inSubcategory] = await Promise.all([
    listPublishedGuides(db, { subcategoryId: topic.id, limit: TOPIC_GUIDES_MAX }),
    listPublishedGuides(db, {
      subcategoryGroupId: topic.groupId,
      withoutTopic: true,
      limit: TOPIC_GUIDES_MAX,
    }),
  ]);
  const seen = new Set(filed.map((guide) => guide.slug));
  const matched = inSubcategory.filter(
    (guide) => !seen.has(guide.slug) && titleMatchesTopic(topic.name, guide.title),
  );
  return [...filed, ...matched].sort((a, b) => b.firstPublishedAt.getTime() - a.firstPublishedAt.getTime());
}

export async function countPublishedGuides(db: Db, filter: GuideFilter = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .where(filterConditions(filter));
  return row?.count ?? 0;
}

/**
 * The current address of a published guide that used `slug` in an earlier revision, so old links
 * keep working after a rename. Callers check for a live guide at `slug` first; that always wins.
 */
export async function findRenamedGuide(
  db: Db,
  slug: string,
): Promise<{ slug: string; category: CategorySlug | null } | null> {
  const earlier = alias(guideRevisions, "earlier");
  const [row] = await db
    .select({ slug: guideRevisions.slug, category: guideRevisions.category })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .where(
      and(
        ne(guideRevisions.slug, slug),
        exists(
          db
            .select({ id: earlier.id })
            .from(earlier)
            .where(and(eq(earlier.guideId, guides.id), eq(earlier.slug, slug))),
        ),
      ),
    )
    .orderBy(desc(guides.publishedAt))
    .limit(1);
  return row ?? null;
}

export async function getPublishedGuide(db: Db, slug: string): Promise<PublishedGuide | null> {
  const [row] = await db
    .select({
      ...summaryColumns,
      id: guides.id,
      subcategoryId: guideRevisions.subcategoryId,
      subcategoryGroupId: guideRevisions.subcategoryGroupId,
      body: guideRevisions.body,
      closing: guideRevisions.closing,
      seoTitle: guideRevisions.seoTitle,
      seoDescription: guideRevisions.seoDescription,
      topicIds: guideRevisions.topicIds,
      productRefs: guideRevisions.products,
      faqs: guideRevisions.faqs,
      articleImageStyle: guideRevisions.articleImageStyle,
      featuredImageStyle: guideRevisions.featuredImageStyle,
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

  const imageSizes = await bodyImageSizes(db, `${row.body}\n${row.closing}`);

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
    subcategoryId: row.subcategoryId,
    subcategoryGroupId: row.subcategoryGroupId,
    body: row.body,
    closing: row.closing,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    topicIds: row.topicIds,
    topics: topicRows,
    products: orderedProducts,
    faqs: row.faqs,
    articleImageStyle: resolveArticleImageStyle(row.articleImageStyle),
    featuredImageStyle: resolveFeaturedImageStyle(row.featuredImageStyle),
    bodyImageSizes: imageSizes,
  };
}

export type ArticleTopic = { id: string; slug: string; name: string };

/**
 * Subcategory buttons for an article: the same sections as its category page, in the same order.
 * They follow the published article's category, the way related guides do, rather than a separate topic list.
 */
export async function articleTopics(db: Db, category: CategorySlug | null): Promise<ArticleTopic[]> {
  if (!category) return [];
  return db
    .select({
      id: subcategoryGroups.id,
      slug: subcategoryGroups.slug,
      name: subcategoryGroups.name,
    })
    .from(subcategoryGroups)
    .where(eq(subcategoryGroups.category, category))
    .orderBy(asc(subcategoryGroups.position), asc(subcategoryGroups.name));
}

/** Same-category guides first, then guides sharing a topic, newest first. */
export async function relatedGuides(
  db: Db,
  guide: { slug: string; category: CategorySlug | null; topicIds: readonly string[] },
  limit = 3,
): Promise<GuideSummary[]> {
  const sharesTopic = guide.topicIds.length
    ? sql`${guideRevisions.topicIds} && ${sql.param(guide.topicIds)}::uuid[]`
    : sql`false`;
  const sameCategory = guide.category ? sql`${guideRevisions.category} = ${guide.category}` : sql`false`;
  const rows = await publishedGuides(db)
    .where(and(ne(guideRevisions.slug, guide.slug), sql`(${sameCategory} or ${sharesTopic})`))
    .orderBy(...(guide.category ? [sql`(${sameCategory}) desc`] : []), desc(guides.firstPublishedAt))
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
  /** Featured image first, then body images in reading order; listed in the image sitemap. */
  images: string[];
};

const BODY_IMAGE_PATH = String.raw`!\[[^]\n]*\]\((/media/[0-9a-f-]{36}/[^)\s#?]+)`;

/** Body image paths as written, found in the database so article text is never sent to the app. */
const bodyImagePaths = sql<string[]>`coalesce((
  select array_agg(f.path order by f.pos) from (
    select x[1] as path, min(n) as pos
    from regexp_matches(${guideRevisions.body} || chr(10) || ${guideRevisions.closing}, ${BODY_IMAGE_PATH}, 'g')
      with ordinality as t(x, n)
    group by x[1]
  ) f
  where exists (select 1 from media_assets m where m.id::text = substring(f.path from 8 for 36))
), array[]::text[])`;

export async function listSitemapGuides(db: Db): Promise<SitemapGuide[]> {
  const rows = await db
    .select({
      slug: guideRevisions.slug,
      category: guideRevisions.category,
      topicSlugs: sql<
        string[]
      >`coalesce((select array_agg(t.slug order by t.slug) from topics t where t.id = any(${guideRevisions.topicIds})), '{}')`,
      updatedAt: guides.publishedAt,
      imageId: mediaAssets.id,
      imageFilename: mediaAssets.filename,
      bodyImages: bodyImagePaths,
    })
    .from(guides)
    .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
    .leftJoin(mediaAssets, eq(guideRevisions.featuredImageId, mediaAssets.id))
    .orderBy(desc(guides.publishedAt));
  return rows.map(({ imageId, imageFilename, bodyImages, ...row }) => {
    const featured = imageId && imageFilename ? [mediaPath(imageId, imageFilename)] : [];
    return {
      ...row,
      updatedAt: row.updatedAt!,
      images: [...new Set([...featured, ...bodyImages])],
    };
  });
}
