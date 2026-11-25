import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CATEGORY_SLUGS } from "../content/categories";
import type { ArticleImageStyle } from "../lib/content/article-image-style";
import { CONTACT_TOPICS } from "../lib/content/contact-schema";
import type { FeaturedImageStyle } from "../lib/content/featured-image-style";
import type { HomepageContent } from "../lib/content/homepage-schema";

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$";

export const userRole = pgEnum("user_role", ["owner", "editor", "author"]);
export const guideCategory = pgEnum("guide_category", CATEGORY_SLUGS);
export const reviewState = pgEnum("review_state", [
  "not_requested",
  "in_review",
  "changes_requested",
  "approved",
]);
export const reviewDecision = pgEnum("review_decision", ["approved", "changes_requested"]);
export const revisionReason = pgEnum("revision_reason", ["created", "saved", "restored"]);
export const productStatus = pgEnum("product_status", ["draft", "active", "retired"]);
export const contactTopic = pgEnum("contact_topic", CONTACT_TOPICS);

// ---------------------------------------------------------------------------
// Accounts and security
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_name_length", sql`char_length(${t.name}) between 1 and 80`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** One-time password-reset tokens. Only the SHA-256 of the raw token is stored. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_id_idx").on(t.userId),
  ],
);

/**
 * Daily totals of public page opens. One row per path per day. No visitor identity, IP or cookie.
 */
export const pageViews = pgTable(
  "page_views",
  {
    path: text("path").notNull(),
    /** Calendar day in Asia/Kolkata, stored as YYYY-MM-DD. */
    day: date("day").notNull(),
    views: integer("views").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.path, t.day] }),
    index("page_views_day_idx").on(t.day),
    check("page_views_path_length", sql`char_length(${t.path}) between 1 and 200`),
    check(
      "page_views_path_shape",
      sql`${t.path} = '/' or ${t.path} ~ '^(/[a-z0-9][a-z0-9_-]*)+$'`,
    ),
    check(
      "page_views_path_public",
      sql`${t.path} !~ '^/(admin|media|_next|og|page-view)(/|$)'`,
    ),
    check("page_views_count", sql`${t.views} between 1 and 2000000000`),
  ],
);

export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    /** Hashed bucket key, e.g. sha256("login:email:<email>"). Never stores raw emails or IPs. */
    bucket: text("bucket").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rate_limit_events_bucket_created_idx").on(t.bucket, t.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_events_created_idx").on(t.createdAt),
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Reader messages
// ---------------------------------------------------------------------------

/** Messages sent through the public contact form. */
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    topic: contactTopic("topic").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    lastRepliedAt: timestamp("last_replied_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("contact_messages_created_idx").on(t.createdAt),
    check("contact_messages_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("contact_messages_email_length", sql`char_length(${t.email}) between 3 and 254`),
    check("contact_messages_message_length", sql`char_length(${t.message}) between 1 and 4000`),
  ],
);

/** Replies emailed to the sender from the admin. Only replies that were handed to the mail service. */
export const contactReplies = pgTable(
  "contact_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => contactMessages.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("contact_replies_message_idx").on(t.messageId, t.createdAt),
    check("contact_replies_body_length", sql`char_length(${t.body}) between 1 and 5000`),
  ],
);

// ---------------------------------------------------------------------------
// Taxonomy and media
// ---------------------------------------------------------------------------

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("topics_slug_key").on(t.slug),
    check("topics_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check("topics_name_length", sql`char_length(${t.name}) between 2 and 60`),
  ],
);

/** One processed size stored beside the master (WebP variants for responsive delivery). */
export type MediaVariantRecord = {
  label: string;
  width: number;
  height: number;
  byteSize: number;
  contentType: string;
  filename: string;
  storageKey: string;
  storageUrl: string;
};

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    /** Legacy Postgres binary storage. Null when the file lives in object storage. */
    data: bytea("data"),
    /** Object-store provider id, e.g. `vercel_blob`. Null for legacy bytea rows. */
    storageProvider: text("storage_provider"),
    /** Object-store pathname for the master file. */
    storageKey: text("storage_key"),
    /** Private object URL for the master (used for authenticated fetch/delete). */
    storageUrl: text("storage_url"),
    /** Extra responsive sizes; empty/null when only the master exists. */
    variants: jsonb("variants").$type<MediaVariantRecord[]>().notNull().default([]),
    altText: text("alt_text").notNull(),
    credit: text("credit"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("media_assets_sha256_key").on(t.sha256),
    check(
      "media_assets_content_type",
      sql`${t.contentType} in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')`,
    ),
    check("media_assets_byte_size", sql`${t.byteSize} > 0 and ${t.byteSize} <= 5242880`),
    check("media_assets_dimensions", sql`${t.width} between 1 and 10000 and ${t.height} between 1 and 10000`),
    check("media_assets_alt_length", sql`char_length(${t.altText}) between 5 and 200`),
    // Exactly one backing store: legacy bytea, or object storage with provider + key + url.
    check(
      "media_assets_storage_backing",
      sql`(
        (${t.data} is not null and ${t.storageKey} is null and ${t.storageUrl} is null and ${t.storageProvider} is null)
        or
        (${t.data} is null and ${t.storageKey} is not null and ${t.storageUrl} is not null and ${t.storageProvider} is not null)
      )`,
    ),
    check(
      "media_assets_storage_provider",
      sql`${t.storageProvider} is null or ${t.storageProvider} in ('vercel_blob')`,
    ),
  ],
);

/**
 * The public homepage, header, footer and category presentation. One row, id `site`.
 * Article addresses stay on the five category slugs; this row only changes what readers see.
 */
export const homepageSettings = pgTable(
  "homepage_settings",
  {
    id: text("id").primaryKey(),
    content: jsonb("content").$type<HomepageContent>().notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("homepage_settings_singleton", sql`${t.id} = 'site'`),
    check("homepage_settings_content_object", sql`jsonb_typeof(${t.content}) = 'object'`),
  ],
);

// ---------------------------------------------------------------------------
// Products (editorial recommendations; no prices, ratings or reviews by design)
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    summary: text("summary").notNull(),
    merchantName: text("merchant_name"),
    productUrl: text("product_url"),
    /** Date an editor last checked the details against the manufacturer or seller listing. */
    verifiedOn: date("verified_on"),
    status: productStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_slug_key").on(t.slug),
    check("products_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check("products_url_https", sql`${t.productUrl} is null or ${t.productUrl} ~ '^https://'`),
    check("products_active_verified", sql`${t.status} <> 'active' or ${t.verifiedOn} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

/** Ordered product picks stored in a guide revision snapshot. */
export type RevisionProductRef = { productId: string; note: string | null };

/** Ordered question-and-answer pairs shown in the article's FAQ section. */
export type GuideFaq = { question: string; answer: string };

/** A heading on a category page. It groups subcategories and is not itself a public address. */
export const subcategoryGroups = pgTable(
  "subcategory_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: guideCategory("category").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    iconMediaId: uuid("icon_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("subcategory_groups_category_name").on(t.category, t.name),
    unique("subcategory_groups_category_slug").on(t.category, t.slug),
    check("subcategory_groups_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check("subcategory_groups_name_length", sql`char_length(${t.name}) between 2 and 80`),
    check("subcategory_groups_description_length", sql`char_length(${t.description}) between 20 and 300`),
    check("subcategory_groups_position_nonneg", sql`${t.position} >= 0`),
    index("subcategory_groups_category_idx").on(t.category, t.position),
  ],
);

/** A leaf under a category. Articles are filed here; there is no further level. */
export const subcategories = pgTable(
  "subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => subcategoryGroups.id, { onDelete: "restrict" }),
    category: guideCategory("category").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("subcategories_category_slug").on(t.category, t.slug),
    unique("subcategories_group_name").on(t.groupId, t.name),
    check("subcategories_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check("subcategories_name_length", sql`char_length(${t.name}) between 2 and 80`),
    check("subcategories_position_nonneg", sql`${t.position} >= 0`),
    index("subcategories_group_idx").on(t.groupId, t.position),
  ],
);

/**
 * The working copy that editors save. The public site never reads this table's content
 * columns directly — it reads the revision referenced by `publishedRevisionId`.
 */
export const guides = pgTable(
  "guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    /** Closing section (e.g. Final thoughts), edited separately from the body. */
    closing: text("closing").notNull().default(""),
    category: guideCategory("category"),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, { onDelete: "restrict" }),
    subcategoryGroupId: uuid("subcategory_group_id").references(() => subcategoryGroups.id, {
      onDelete: "restrict",
    }),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    featuredImageId: uuid("featured_image_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    featuredImageAlt: text("featured_image_alt"),
    /** How the featured image sits in the banner frame. `{}` means the defaults. */
    featuredImageStyle: jsonb("featured_image_style")
      .$type<Partial<FeaturedImageStyle>>()
      .notNull()
      .default({}),
    faqs: jsonb("faqs").$type<GuideFaq[]>().notNull().default([]),
    /** Look of the images beside article sections. `{}` means the defaults. */
    articleImageStyle: jsonb("article_image_style").$type<Partial<ArticleImageStyle>>().notNull().default({}),
    /** Incremented on every write; used for optimistic concurrency. */
    version: integer("version").notNull().default(1),
    contentHash: text("content_hash").notNull(),
    reviewState: reviewState("review_state").notNull().default("not_requested"),
    /** Content hash that the latest approval applies to. Publishing requires it to equal contentHash. */
    approvedContentHash: text("approved_content_hash"),
    currentRevisionId: uuid("current_revision_id").references((): AnyPgColumn => guideRevisions.id, {
      onDelete: "set null",
    }),
    publishedRevisionId: uuid("published_revision_id").references((): AnyPgColumn => guideRevisions.id, {
      onDelete: "restrict",
    }),
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("guides_slug_key").on(t.slug),
    check("guides_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check("guides_title_length", sql`char_length(${t.title}) between 3 and 140`),
    check(
      "guides_published_consistency",
      sql`(${t.publishedRevisionId} is null) = (${t.publishedAt} is null) and (${t.publishedAt} is null or ${t.firstPublishedAt} is not null)`,
    ),
    check(
      "guides_approval_consistency",
      sql`(${t.reviewState} = 'approved') = (${t.approvedContentHash} is not null)`,
    ),
    index("guides_published_idx").on(t.publishedAt),
    index("guides_subcategory_idx").on(t.subcategoryId),
    index("guides_subcategory_group_idx").on(t.subcategoryGroupId),
    check("guides_subcategory_category", sql`${t.subcategoryId} is null or ${t.category} is not null`),
    check("guides_faqs_array", sql`jsonb_typeof(${t.faqs}) = 'array'`),
    check("guides_article_image_style_object", sql`jsonb_typeof(${t.articleImageStyle}) = 'object'`),
    check("guides_featured_image_style_object", sql`jsonb_typeof(${t.featuredImageStyle}) = 'object'`),
  ],
);

export const guideTopics = pgTable(
  "guide_topics",
  {
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.topicId] }), index("guide_topics_topic_idx").on(t.topicId)],
);

export const guideProducts = pgTable(
  "guide_products",
  {
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    note: text("note"),
  },
  (t) => [
    primaryKey({ columns: [t.guideId, t.productId] }),
    unique("guide_products_position_key").on(t.guideId, t.position),
    index("guide_products_product_idx").on(t.productId),
  ],
);

/** Immutable snapshot of a guide's material content, written on every save that changes it. */
export const guideRevisions = pgTable(
  "guide_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    body: text("body").notNull(),
    closing: text("closing").notNull().default(""),
    category: guideCategory("category"),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, { onDelete: "restrict" }),
    subcategoryGroupId: uuid("subcategory_group_id").references(() => subcategoryGroups.id, {
      onDelete: "restrict",
    }),
    topicIds: uuid("topic_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    products: jsonb("products").$type<RevisionProductRef[]>().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    featuredImageId: uuid("featured_image_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    featuredImageAlt: text("featured_image_alt"),
    featuredImageStyle: jsonb("featured_image_style")
      .$type<Partial<FeaturedImageStyle>>()
      .notNull()
      .default({}),
    faqs: jsonb("faqs").$type<GuideFaq[]>().notNull().default([]),
    articleImageStyle: jsonb("article_image_style").$type<Partial<ArticleImageStyle>>().notNull().default({}),
    contentHash: text("content_hash").notNull(),
    reason: revisionReason("reason").notNull(),
    restoredFromRevisionId: uuid("restored_from_revision_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("guide_revisions_number_key").on(t.guideId, t.revisionNumber),
    index("guide_revisions_guide_idx").on(t.guideId, t.createdAt),
    index("guide_revisions_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.title} || ' ' || ${t.excerpt} || ' ' || ${t.body} || ' ' || ${t.closing})`,
    ),
    index("guide_revisions_subcategory_idx").on(t.subcategoryId),
    index("guide_revisions_subcategory_group_idx").on(t.subcategoryGroupId),
    check(
      "guide_revisions_subcategory_category",
      sql`${t.subcategoryId} is null or ${t.category} is not null`,
    ),
    check("guide_revisions_faqs_array", sql`jsonb_typeof(${t.faqs}) = 'array'`),
    check("guide_revisions_article_image_style_object", sql`jsonb_typeof(${t.articleImageStyle}) = 'object'`),
    check(
      "guide_revisions_featured_image_style_object",
      sql`jsonb_typeof(${t.featuredImageStyle}) = 'object'`,
    ),
  ],
);

export const guideReviews = pgTable(
  "guide_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => guideRevisions.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: reviewDecision("decision").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("guide_reviews_guide_idx").on(t.guideId, t.createdAt)],
);
