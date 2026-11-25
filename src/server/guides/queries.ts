import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import {
  guideProducts,
  guideReviews,
  guideRevisions,
  guides,
  guideTopics,
  homepageSettings,
  mediaAssets,
  products,
  subcategoryGroups,
  topics,
  users,
  type GuideFaq,
  type RevisionProductRef,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { CATEGORY_SLUGS, type CategorySlug } from "@/content/categories";
import { type ArticleImageStyle, resolveArticleImageStyle } from "@/lib/content/article-image-style";
import type { BodyImageSizes } from "@/lib/content/body-images";
import { type FeaturedImageStyle, resolveFeaturedImageStyle } from "@/lib/content/featured-image-style";
import type { GuideContent } from "@/lib/content/guide-schema";
import { readingMinutes } from "@/lib/content/markdown";
import {
  publicationState,
  REVIEW_STATES,
  type PublicationState,
  type ReviewState,
} from "@/lib/content/guide-status";
import {
  bodyImageSizes,
  mediaPath,
  type PublicImage,
  type PublicProduct,
  type PublicTopic,
} from "@/server/public-content";
import { can, canEditGuide, type Actor } from "@/server/auth/permissions";

export const GUIDE_PAGE_SIZE_DEFAULT = 20;
export const GUIDE_PAGE_SIZE_MAX = 50;
export const GUIDE_PAGE_MAX = 10_000;
export const REVISION_LIST_LIMIT = 100;
export const EDITOR_MEDIA_LIMIT = 60;

export type GuideListQuery = {
  q?: string;
  category?: CategorySlug;
  authorId?: string;
  reviewState?: ReviewState;
  status?: PublicationState;
  page: number;
  pageSize: number;
};

export type GuideListItem = {
  id: string;
  title: string;
  slug: string;
  category: CategorySlug | null;
  authorId: string;
  authorName: string;
  updatedAt: Date;
  version: number;
  revisionNumber: number | null;
  reviewState: ReviewState;
  publication: PublicationState;
};

export type GuideListResult = {
  items: GuideListItem[];
  total: number;
  page: number;
  pageSize: number;
  authors: Array<{ id: string; name: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function boundedInt(raw: string, fallback: number, max: number): number {
  if (!/^[1-9]\d{0,4}$/.test(raw)) return fallback;
  return Math.min(max, Number(raw));
}

export function normaliseGuideListQuery(raw: {
  q?: string | string[];
  category?: string | string[];
  authorId?: string | string[];
  reviewState?: string | string[];
  status?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
}): GuideListQuery {
  const q = one(raw.q).slice(0, 100);
  const category = one(raw.category);
  const authorId = one(raw.authorId);
  const review = one(raw.reviewState);
  const status = one(raw.status);
  return {
    ...(q ? { q } : {}),
    ...(CATEGORY_SLUGS.includes(category as CategorySlug) ? { category: category as CategorySlug } : {}),
    ...(UUID.test(authorId) ? { authorId } : {}),
    ...(REVIEW_STATES.includes(review as ReviewState) ? { reviewState: review as ReviewState } : {}),
    ...(status === "draft" || status === "published" || status === "unpublished_edits" ? { status } : {}),
    page: boundedInt(one(raw.page), 1, GUIDE_PAGE_MAX),
    pageSize: boundedInt(one(raw.pageSize), GUIDE_PAGE_SIZE_DEFAULT, GUIDE_PAGE_SIZE_MAX),
  };
}

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function listWhere(actor: Actor, query: GuideListQuery): SQL | undefined {
  const conditions: SQL[] = [];
  if (!can(actor, "guide.editAny")) conditions.push(eq(guides.createdBy, actor.id));
  else if (query.authorId) conditions.push(eq(guides.createdBy, query.authorId));
  if (query.category) conditions.push(eq(guides.category, query.category));
  if (query.reviewState) conditions.push(eq(guides.reviewState, query.reviewState));
  if (query.status === "draft") conditions.push(isNull(guides.publishedRevisionId));
  if (query.status === "published") {
    conditions.push(
      and(isNotNull(guides.publishedRevisionId), eq(guides.currentRevisionId, guides.publishedRevisionId))!,
    );
  }
  if (query.status === "unpublished_edits") {
    conditions.push(
      and(
        isNotNull(guides.publishedRevisionId),
        sql`${guides.currentRevisionId} is distinct from ${guides.publishedRevisionId}`,
      )!,
    );
  }
  if (query.q) {
    const pattern = likeContains(query.q);
    conditions.push(
      sql`(${guides.title} ilike ${pattern} escape '\\' or ${guides.slug} ilike ${pattern} escape '\\')`,
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listGuides(db: Db, actor: Actor, query: GuideListQuery): Promise<GuideListResult> {
  const pageSize = Math.min(GUIDE_PAGE_SIZE_MAX, Math.max(1, query.pageSize));
  const page = Math.min(GUIDE_PAGE_MAX, Math.max(1, query.page));
  const where = listWhere(actor, query);
  const [countRow, rows, authors] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(guides)
      .where(where),
    db
      .select({
        id: guides.id,
        title: guides.title,
        slug: guides.slug,
        category: guides.category,
        authorId: guides.createdBy,
        authorName: users.name,
        updatedAt: guides.updatedAt,
        version: guides.version,
        revisionNumber: guideRevisions.revisionNumber,
        reviewState: guides.reviewState,
        publishedRevisionId: guides.publishedRevisionId,
        currentRevisionId: guides.currentRevisionId,
      })
      .from(guides)
      .innerJoin(users, eq(guides.createdBy, users.id))
      .leftJoin(guideRevisions, eq(guides.currentRevisionId, guideRevisions.id))
      .where(where)
      .orderBy(desc(guides.updatedAt), desc(guides.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    can(actor, "guide.editAny")
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(sql`exists (select 1 from ${guides} where ${guides.createdBy} = ${users.id})`)
          .orderBy(asc(users.name))
      : Promise.resolve([]),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      category: row.category,
      authorId: row.authorId,
      authorName: row.authorName,
      updatedAt: row.updatedAt,
      version: row.version,
      revisionNumber: row.revisionNumber,
      reviewState: row.reviewState,
      publication: publicationState(row),
    })),
    total: countRow[0]?.n ?? 0,
    page,
    pageSize,
    authors,
  };
}

async function loadAssociations(db: Db, guideId: string) {
  const [topicRows, productRows] = await Promise.all([
    db.select({ topicId: guideTopics.topicId }).from(guideTopics).where(eq(guideTopics.guideId, guideId)),
    db
      .select({ productId: guideProducts.productId, note: guideProducts.note })
      .from(guideProducts)
      .where(eq(guideProducts.guideId, guideId))
      .orderBy(asc(guideProducts.position)),
  ]);
  return {
    topicIds: topicRows.map((row) => row.topicId),
    products: productRows.map((row) => ({ productId: row.productId, note: row.note })),
  };
}

export function contentFromParts(
  row: {
    title: string;
    slug: string;
    excerpt: string;
    body: string;
    closing: string;
    category: CategorySlug | null;
    subcategoryId: string | null;
    subcategoryGroupId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    featuredImageId: string | null;
    featuredImageAlt: string | null;
    featuredImageStyle: Partial<FeaturedImageStyle>;
    faqs: GuideFaq[];
    articleImageStyle: Partial<ArticleImageStyle>;
  },
  associations: { topicIds: string[]; products: RevisionProductRef[] },
): GuideContent {
  return {
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body,
    closing: row.closing,
    category: row.category,
    subcategoryId: row.subcategoryId,
    subcategoryGroupId: row.subcategoryGroupId,
    topicIds: associations.topicIds,
    products: associations.products,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    featuredImageId: row.featuredImageId,
    featuredImageAlt: row.featuredImageAlt,
    featuredImageStyle: resolveFeaturedImageStyle(row.featuredImageStyle),
    faqs: row.faqs,
    articleImageStyle: resolveArticleImageStyle(row.articleImageStyle),
  };
}

export type EditableGuide = {
  id: string;
  version: number;
  everPublished: boolean;
  reviewState: ReviewState;
  publication: PublicationState;
  updatedAt: Date;
  deletable: boolean;
  content: GuideContent;
  currentRevisionId: string | null;
  currentRevisionNumber: number | null;
  contentHash: string;
  publishedRevisionId: string | null;
  publishedRevisionNumber: number | null;
  publishedAt: Date | null;
  /** True when the approval covers exactly the current content, so the article can be published. */
  approvalCurrent: boolean;
  latestReview: {
    decision: "approved" | "changes_requested";
    notes: string | null;
    reviewerName: string;
    createdAt: Date;
    revisionNumber: number | null;
  } | null;
};

async function visibleGuide(db: Db, actor: Actor, guideId: string) {
  if (!UUID.test(guideId)) return null;
  const [guide] = await db.select().from(guides).where(eq(guides.id, guideId)).limit(1);
  if (!guide || !canEditGuide(actor, guide)) return null;
  return guide;
}

export async function getEditableGuide(db: Db, actor: Actor, guideId: string): Promise<EditableGuide | null> {
  const guide = await visibleGuide(db, actor, guideId);
  if (!guide) return null;
  const revisionIds = [guide.currentRevisionId, guide.publishedRevisionId].filter((id): id is string => !!id);
  const [associations, revisionRows, reviewRows] = await Promise.all([
    loadAssociations(db, guide.id),
    revisionIds.length
      ? db
          .select({ id: guideRevisions.id, revisionNumber: guideRevisions.revisionNumber })
          .from(guideRevisions)
          .where(inArray(guideRevisions.id, revisionIds))
      : Promise.resolve([]),
    db
      .select({
        decision: guideReviews.decision,
        notes: guideReviews.notes,
        reviewerName: users.name,
        createdAt: guideReviews.createdAt,
        revisionNumber: guideRevisions.revisionNumber,
      })
      .from(guideReviews)
      .innerJoin(users, eq(guideReviews.reviewerId, users.id))
      .leftJoin(guideRevisions, eq(guideReviews.revisionId, guideRevisions.id))
      .where(eq(guideReviews.guideId, guide.id))
      .orderBy(desc(guideReviews.createdAt))
      .limit(1),
  ]);
  const numberOf = (id: string | null) => revisionRows.find((row) => row.id === id)?.revisionNumber ?? null;
  return {
    id: guide.id,
    version: guide.version,
    everPublished: guide.firstPublishedAt !== null,
    reviewState: guide.reviewState,
    publication: publicationState(guide),
    updatedAt: guide.updatedAt,
    deletable: can(actor, "guide.delete") && guide.publishedRevisionId === null,
    content: contentFromParts(guide, associations),
    currentRevisionId: guide.currentRevisionId,
    currentRevisionNumber: numberOf(guide.currentRevisionId),
    contentHash: guide.contentHash,
    publishedRevisionId: guide.publishedRevisionId,
    publishedRevisionNumber: numberOf(guide.publishedRevisionId),
    publishedAt: guide.publishedAt,
    approvalCurrent: guide.reviewState === "approved" && guide.approvedContentHash === guide.contentHash,
    latestReview: reviewRows[0] ?? null,
  };
}

export type RevisionListItem = {
  id: string;
  revisionNumber: number;
  reason: "created" | "saved" | "restored";
  createdAt: Date;
  authorName: string;
  restoredFromNumber: number | null;
  current: boolean;
  published: boolean;
};

export async function listRevisions(
  db: Db,
  actor: Actor,
  guideId: string,
): Promise<{ title: string; version: number; items: RevisionListItem[]; truncated: boolean } | null> {
  const guide = await visibleGuide(db, actor, guideId);
  if (!guide) return null;
  const rows = await db
    .select({
      id: guideRevisions.id,
      revisionNumber: guideRevisions.revisionNumber,
      reason: guideRevisions.reason,
      createdAt: guideRevisions.createdAt,
      authorName: users.name,
      restoredFromRevisionId: guideRevisions.restoredFromRevisionId,
    })
    .from(guideRevisions)
    .innerJoin(users, eq(guideRevisions.createdBy, users.id))
    .where(eq(guideRevisions.guideId, guide.id))
    .orderBy(desc(guideRevisions.revisionNumber))
    .limit(REVISION_LIST_LIMIT + 1);
  const truncated = rows.length > REVISION_LIST_LIMIT;
  const visible = truncated ? rows.slice(0, REVISION_LIST_LIMIT) : rows;
  const numbers = new Map(visible.map((row) => [row.id, row.revisionNumber]));
  return {
    title: guide.title,
    version: guide.version,
    truncated,
    items: visible.map((row) => ({
      id: row.id,
      revisionNumber: row.revisionNumber,
      reason: row.reason,
      createdAt: row.createdAt,
      authorName: row.authorName,
      restoredFromNumber: row.restoredFromRevisionId
        ? (numbers.get(row.restoredFromRevisionId) ?? null)
        : null,
      current: row.id === guide.currentRevisionId,
      published: row.id === guide.publishedRevisionId,
    })),
  };
}

export async function getRevisionComparison(db: Db, actor: Actor, guideId: string, revisionId: string) {
  const guide = await visibleGuide(db, actor, guideId);
  if (!guide || !UUID.test(revisionId)) return null;
  const [revision] = await db
    .select()
    .from(guideRevisions)
    .where(and(eq(guideRevisions.id, revisionId), eq(guideRevisions.guideId, guide.id)))
    .limit(1);
  if (!revision) return null;
  const [author] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, revision.createdBy))
    .limit(1);
  const associations = await loadAssociations(db, guide.id);
  const working = contentFromParts(guide, associations);
  const snapshot: GuideContent = {
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
  return {
    guide: {
      id: guide.id,
      title: guide.title,
      version: guide.version,
      currentRevisionId: guide.currentRevisionId,
      createdBy: guide.createdBy,
    },
    revision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      reason: revision.reason,
      createdAt: revision.createdAt,
      authorName: author?.name ?? "Unknown",
      restoredFromRevisionId: revision.restoredFromRevisionId,
      current: revision.id === guide.currentRevisionId,
      published: revision.id === guide.publishedRevisionId,
      content: snapshot,
    },
    working,
  };
}

export type DraftPreview = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  closing: string;
  category: CategorySlug | null;
  subcategoryId: string | null;
  subcategoryGroupId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  topicIds: string[];
  topics: PublicTopic[];
  products: PublicProduct[];
  faqs: GuideFaq[];
  articleImageStyle: ArticleImageStyle;
  featuredImageStyle: FeaturedImageStyle;
  readingMinutes: number;
  updatedAt: Date;
  firstPublishedAt: Date | null;
  image: PublicImage | null;
  bodyImageSizes: BodyImageSizes;
};

/** Latest saved working copy. Does not read or write `published_revision_id`. */
export async function getDraftPreview(db: Db, actor: Actor, guideId: string): Promise<DraftPreview | null> {
  const guide = await visibleGuide(db, actor, guideId);
  if (!guide) return null;
  const associations = await loadAssociations(db, guide.id);
  const topicRows = associations.topicIds.length
    ? await db
        .select({ id: topics.id, slug: topics.slug, name: topics.name, description: topics.description })
        .from(topics)
        .where(inArray(topics.id, associations.topicIds))
        .orderBy(asc(topics.name))
    : [];
  const productIds = associations.products.map((item) => item.productId);
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
  const orderedProducts = associations.products.flatMap((item) => {
    const product = productsById.get(item.productId);
    return product ? [{ ...product, note: item.note }] : [];
  });
  let image: PublicImage | null = null;
  if (guide.featuredImageId) {
    const [asset] = await db
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.filename,
        width: mediaAssets.width,
        height: mediaAssets.height,
        altText: mediaAssets.altText,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, guide.featuredImageId))
      .limit(1);
    if (asset) {
      image = {
        src: mediaPath(asset.id, asset.filename),
        width: asset.width,
        height: asset.height,
        alt: guide.featuredImageAlt ?? asset.altText,
      };
    }
  }
  return {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    excerpt: guide.excerpt,
    body: guide.body,
    closing: guide.closing,
    category: guide.category,
    subcategoryId: guide.subcategoryId,
    subcategoryGroupId: guide.subcategoryGroupId,
    seoTitle: guide.seoTitle,
    seoDescription: guide.seoDescription,
    topicIds: associations.topicIds,
    topics: topicRows,
    products: orderedProducts,
    faqs: guide.faqs,
    articleImageStyle: resolveArticleImageStyle(guide.articleImageStyle),
    featuredImageStyle: resolveFeaturedImageStyle(guide.featuredImageStyle),
    readingMinutes: readingMinutes(`${guide.body}\n\n${guide.closing}`),
    updatedAt: guide.updatedAt,
    firstPublishedAt: guide.firstPublishedAt,
    image,
    bodyImageSizes: await bodyImageSizes(db, `${guide.body}\n${guide.closing}`),
  };
}

export async function listEditorTopics(db: Db) {
  return db
    .select({ id: topics.id, name: topics.name, slug: topics.slug })
    .from(topics)
    .orderBy(asc(topics.name));
}

export async function listEditorProducts(db: Db) {
  return db
    .select({ id: products.id, name: products.name, status: products.status })
    .from(products)
    .orderBy(asc(products.name));
}

export type MediaSummary = {
  id: string;
  filename: string;
  contentType: string;
  altText: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: Date;
  src: string;
  /** Where the image is still referenced — deletion is refused while this is set. */
  usedBy: MediaUse | null;
};

/** `published`: on a live article. `homepage`: logo, hero or category card. `draft`: in another article's current draft. */
export type MediaUse = "published" | "homepage" | "draft" | "category";

// Qualify media_assets.id. An unqualified "id" inside the subquery binds to guides.id or
// guide_revisions.id, so a referenced file would look unused.
function mediaUsedBy(editingGuideId: string | null) {
  const path = sql`('%/media/' || "media_assets"."id"::text || '/%')`;
  return sql<MediaUse | null>`case
    when exists (
      select 1 from ${guides} g join ${guideRevisions} r on r.id = g.published_revision_id
      where r.featured_image_id = "media_assets"."id" or r.body like ${path}
    ) then 'published'
    when exists (
      select 1 from ${subcategoryGroups} sg where sg.icon_media_id = "media_assets"."id"
    ) then 'category'
    when exists (
      select 1 from ${homepageSettings} h
      where h.id = 'site'
        and position(lower("media_assets"."id"::text) in lower(h.content::text)) > 0
    ) then 'homepage'
    when exists (
      select 1 from ${guideRevisions} r
      where (r.featured_image_id = "media_assets"."id" or r.body like ${path})
        ${editingGuideId ? sql`and r.guide_id <> ${editingGuideId}` : sql``}
    ) then 'draft'
    when exists (
      select 1 from ${guides} g
      where (g.featured_image_id = "media_assets"."id" or g.body like ${path})
        ${editingGuideId ? sql`and g.id <> ${editingGuideId}` : sql``}
    ) then 'draft'
  end`;
}

export async function listMedia(db: Db, limit: number, offset: number) {
  const bounded = Math.min(60, Math.max(1, limit));
  const [countRow, rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(mediaAssets),
    db
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.filename,
        contentType: mediaAssets.contentType,
        altText: mediaAssets.altText,
        width: mediaAssets.width,
        height: mediaAssets.height,
        byteSize: mediaAssets.byteSize,
        createdAt: mediaAssets.createdAt,
        usedBy: mediaUsedBy(null),
      })
      .from(mediaAssets)
      .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id))
      .limit(bounded)
      .offset(Math.max(0, offset)),
  ]);
  return {
    total: countRow[0]?.n ?? 0,
    items: rows.map((row) => ({ ...row, src: mediaPath(row.id, row.filename) })),
  };
}

/** Images for the article editor. Use by `editingGuideId`'s own draft is not reported as `draft`. */
export async function listRecentMedia(
  db: Db,
  featuredId: string | null,
  editingGuideId: string | null = null,
): Promise<MediaSummary[]> {
  const columns = {
    id: mediaAssets.id,
    filename: mediaAssets.filename,
    contentType: mediaAssets.contentType,
    altText: mediaAssets.altText,
    width: mediaAssets.width,
    height: mediaAssets.height,
    byteSize: mediaAssets.byteSize,
    createdAt: mediaAssets.createdAt,
    usedBy: mediaUsedBy(editingGuideId),
  };
  const recent = await db
    .select(columns)
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt))
    .limit(EDITOR_MEDIA_LIMIT);
  if (featuredId && !recent.some((item) => item.id === featuredId)) {
    const [extra] = await db.select(columns).from(mediaAssets).where(eq(mediaAssets.id, featuredId)).limit(1);
    if (extra) recent.unshift(extra);
  }
  return recent.map((row) => ({ ...row, src: mediaPath(row.id, row.filename) }));
}
