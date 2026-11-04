import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { guides, products, subcategories, subcategoryGroups, topics, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { CATEGORY_SLUGS, categories, isCategorySlug, type CategorySlug } from "@/content/categories";
import { slugify } from "@/lib/content/slug";
import { absoluteUrl } from "@/lib/site";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { isRateLimited, recordEvent, type RateLimitRule } from "@/server/auth/rate-limit";
import { safeEqual } from "@/server/auth/tokens";
import { GuideFormError } from "@/server/guides/errors";
import { getHomepageContent } from "@/server/homepage";
import { submitForReview } from "@/server/guides/review";
import { createGuide } from "@/server/guides/workflow";
import { UserInputError } from "@/server/users";

/**
 * Lets an outside tool such as n8n create article drafts. It is off unless AUTOMATION_API_KEY and
 * AUTOMATION_USER_EMAIL are both set. Requests act as that CMS user, so its role decides what they
 * may do; nothing here can publish. Images are left out and added in the editor afterwards.
 */

export const AUTOMATION_KEY_MIN_LENGTH = 32;
export const AUTOMATION_RATE_LIMIT = { limit: 120, windowMs: 60 * 60_000 } as const;
/** Largest request body accepted, comfortably above the longest article the editor allows. */
export const AUTOMATION_BODY_MAX_BYTES = 300_000;

export class AutomationError extends Error {
  override name = "AutomationError";
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const RESPONSE_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export function automationJson(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

/** Expected failures become JSON with their status; anything else is logged and reported generically. */
export function automationErrorResponse(error: unknown): Response {
  if (error instanceof AutomationError) {
    return automationJson(error.status, {
      error: error.message,
      ...(Object.keys(error.fieldErrors).length ? { fieldErrors: error.fieldErrors } : {}),
    });
  }
  console.error("Automation request failed:", error instanceof Error ? error.message : error);
  return automationJson(500, { error: "Something went wrong." });
}

type Env = Readonly<Record<string, string | undefined>>;

export function automationConfig(env: Env = process.env): { key: string; userEmail: string } | null {
  const key = env.AUTOMATION_API_KEY?.trim() ?? "";
  const userEmail = env.AUTOMATION_USER_EMAIL?.trim().toLowerCase() ?? "";
  if (key.length < AUTOMATION_KEY_MIN_LENGTH || !userEmail) return null;
  return { key, userEmail };
}

/** The CMS user a request acts as, after checking the `Authorization: Bearer <key>` header. */
export async function authenticateAutomation(
  db: Db,
  authorization: string | null,
  env: Env = process.env,
): Promise<Actor> {
  const config = automationConfig(env);
  if (!config) throw new AutomationError(404, "Not found.");
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  if (!match?.[1] || !safeEqual(match[1].trim(), config.key)) {
    throw new AutomationError(401, "Missing or invalid API key.");
  }
  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.email, config.userEmail))
    .limit(1);
  if (!user || user.disabledAt) {
    throw new AutomationError(403, "The automation user does not exist or is disabled.");
  }
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export async function assertWithinRateLimit(db: Db, actor: Actor, now = new Date()): Promise<void> {
  const rule: RateLimitRule = { key: `automation:${actor.id}`, ...AUTOMATION_RATE_LIMIT };
  const limited = await db.transaction(async (tx) => {
    if (await isRateLimited(tx, [rule], now)) return true;
    await recordEvent(tx, rule.key, now);
    return false;
  });
  if (limited) throw new AutomationError(429, "Too many requests. Try again later.");
}

const optionalText = z.string().nullable().optional();

/** Names instead of ids, and no image fields: unknown keys are rejected so typos are caught. */
export const automationGuideSchema = z
  .object({
    title: z.string(),
    slug: z.string().optional(),
    excerpt: z.string().default(""),
    body: z.string(),
    closing: z.string().default(""),
    category: z.string().nullable().optional(),
    subcategory: z.string().nullable().optional(),
    topics: z.array(z.string()).default([]),
    products: z.array(z.object({ slug: z.string(), note: optionalText }).strict()).default([]),
    seoTitle: optionalText,
    seoDescription: optionalText,
    faqs: z.array(z.object({ question: z.string(), answer: z.string() }).strict()).default([]),
    submitForReview: z.boolean().default(false),
  })
  .strict();

export type AutomationGuideInput = z.input<typeof automationGuideSchema>;

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

export type CatalogNames = {
  category?: string | null;
  subcategory?: string | null;
  topics: readonly string[];
  products: readonly { slug: string; note?: string | null }[];
};

/** A category by its address, its built-in name or the name shown on the site ("Bedroom & Wardrobe"). */
async function findCategory(db: Db, value: string): Promise<CategorySlug | null> {
  if (isCategorySlug(value)) return value;
  const key = slugify(value);
  const home = await getHomepageContent(db);
  const named = [...categories, ...home.categories].find(
    (item) => item.slug === key || slugify(item.name) === key,
  );
  return named ? named.slug : null;
}

/**
 * A subcategory by its address or its name. Renamed subcategories keep their first address, so
 * "Storage and Shelves" may live at shelves-and-corner-storage. A topic inside a subcategory is
 * accepted too and files the article under that topic.
 */
async function findSubcategory(
  db: Db,
  category: CategorySlug,
  value: string,
): Promise<{ subcategoryGroupId: string; subcategoryId: string | null } | null> {
  const key = slugify(value);
  const [groups, items] = await Promise.all([
    db
      .select({ id: subcategoryGroups.id, slug: subcategoryGroups.slug, name: subcategoryGroups.name })
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.category, category)),
    db
      .select({
        id: subcategories.id,
        groupId: subcategories.groupId,
        slug: subcategories.slug,
        name: subcategories.name,
      })
      .from(subcategories)
      .where(eq(subcategories.category, category)),
  ]);
  const matches = (row: { slug: string; name: string }) => row.slug === key || slugify(row.name) === key;
  const group = groups.find(matches);
  if (group) return { subcategoryGroupId: group.id, subcategoryId: null };
  const topic = items.find(matches);
  if (!topic) return null;
  const parent = groups.find((item) => item.id === topic.groupId);
  return {
    subcategoryGroupId: topic.groupId,
    subcategoryId: parent && parent.slug === topic.slug ? null : topic.id,
  };
}

/** Turns category, subcategory, topic and product names into ids, reporting every unknown name. */
export async function resolveCatalogNames(db: Db, input: CatalogNames) {
  const errors: Record<string, string> = {};
  const categoryInput = input.category?.trim() || null;
  const category = categoryInput ? await findCategory(db, categoryInput) : null;
  if (categoryInput && !category) {
    errors.category = `Unknown category "${categoryInput}". Use one of: ${CATEGORY_SLUGS.join(", ")}.`;
  }

  let subcategoryGroupId: string | null = null;
  let subcategoryId: string | null = null;
  const subcategory = input.subcategory?.trim() || null;
  if (subcategory) {
    if (!categoryInput) {
      errors.subcategory = "Set a category before a subcategory.";
    } else if (category) {
      const found = await findSubcategory(db, category, subcategory);
      if (found) ({ subcategoryGroupId, subcategoryId } = found);
      else {
        const names = await db
          .select({ name: subcategoryGroups.name })
          .from(subcategoryGroups)
          .where(eq(subcategoryGroups.category, category))
          .orderBy(asc(subcategoryGroups.position));
        errors.subcategory = `Unknown subcategory "${subcategory}" in ${category}.${
          names.length ? ` Use one of: ${names.map((row) => row.name).join(", ")}, or one of their topics.` : ""
        }`;
      }
    }
  }

  const topicSlugs = [...new Set(input.topics.map((slug) => slug.trim()).filter(Boolean))];
  const topicRows = topicSlugs.length
    ? await db
        .select({ id: topics.id, slug: topics.slug })
        .from(topics)
        .where(inArray(topics.slug, topicSlugs))
    : [];
  const topicIdBySlug = new Map(topicRows.map((row) => [row.slug, row.id]));
  const unknownTopics = topicSlugs.filter((slug) => !topicIdBySlug.has(slug));
  if (unknownTopics.length) errors.topics = `Unknown topics: ${unknownTopics.join(", ")}.`;

  const productSlugs = input.products.map((item) => item.slug.trim());
  const productRows = productSlugs.length
    ? await db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(inArray(products.slug, productSlugs))
    : [];
  const productIdBySlug = new Map(productRows.map((row) => [row.slug, row.id]));
  const unknownProducts = productSlugs.filter((slug) => !productIdBySlug.has(slug));
  if (unknownProducts.length) errors.products = `Unknown products: ${unknownProducts.join(", ")}.`;

  if (Object.keys(errors).length) throw new AutomationError(422, "Some names could not be found.", errors);
  return {
    category,
    subcategoryGroupId,
    subcategoryId,
    topicIds: topicSlugs.map((slug) => topicIdBySlug.get(slug)!),
    products: input.products.map((item) => ({
      productId: productIdBySlug.get(item.slug.trim())!,
      note: item.note ?? null,
    })),
  };
}

export type AutomationGuideResult = {
  id: string;
  slug: string;
  version: number;
  status: "draft" | "in_review";
  editUrl: string;
  /** Set when the draft was created but could not be submitted for review. */
  warning?: string;
};

/** Creates an unpublished draft, and submits it for review when asked. */
export async function createGuideFromAutomation(
  db: Db,
  actor: Actor,
  raw: unknown,
): Promise<AutomationGuideResult> {
  const parsed = automationGuideSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AutomationError(422, "The request body is not valid.", zodFieldErrors(parsed.error));
  }
  const input = parsed.data;
  const names = await resolveCatalogNames(db, input);
  const slug = input.slug?.trim() || slugify(input.title);

  let created: { id: string; version: number };
  try {
    created = await createGuide(db, actor, {
      title: input.title,
      slug,
      excerpt: input.excerpt,
      body: input.body,
      closing: input.closing,
      category: names.category,
      subcategoryId: names.subcategoryId,
      subcategoryGroupId: names.subcategoryGroupId,
      topicIds: names.topicIds,
      products: names.products,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      featuredImageId: null,
      featuredImageAlt: null,
      faqs: input.faqs,
    });
  } catch (error) {
    if (error instanceof GuideFormError) {
      const taken = error.fieldErrors.slug?.includes("already");
      throw new AutomationError(taken ? 409 : 422, error.message, error.fieldErrors);
    }
    if (error instanceof AuthorizationError) {
      throw new AutomationError(403, "The automation user is not allowed to create articles.");
    }
    throw error;
  }

  let status: AutomationGuideResult["status"] = "draft";
  let warning: string | undefined;
  if (input.submitForReview) {
    const [row] = await db
      .select({
        version: guides.version,
        revisionId: guides.currentRevisionId,
        contentHash: guides.contentHash,
      })
      .from(guides)
      .where(eq(guides.id, created.id))
      .limit(1);
    try {
      await submitForReview(db, actor, {
        guideId: created.id,
        version: row!.version,
        revisionId: row!.revisionId!,
        contentHash: row!.contentHash,
      });
      status = "in_review";
    } catch (error) {
      if (!(error instanceof AuthorizationError || error instanceof UserInputError)) throw error;
      warning = `Created as a draft but not submitted for review: ${error.message}`;
    }
  }

  return {
    id: created.id,
    slug,
    version: created.version,
    status,
    editUrl: absoluteUrl(`/admin/guides/${created.id}`),
    ...(warning ? { warning } : {}),
  };
}

/** Every name the guide endpoint accepts, so a workflow can map its data to them. */
export async function automationCatalog(db: Db) {
  const [groupRows, topicRows, productRows] = await Promise.all([
    db
      .select({
        category: subcategoryGroups.category,
        slug: subcategoryGroups.slug,
        name: subcategoryGroups.name,
      })
      .from(subcategoryGroups)
      .orderBy(asc(subcategoryGroups.category), asc(subcategoryGroups.position)),
    db.select({ slug: topics.slug, name: topics.name }).from(topics).orderBy(asc(topics.name)),
    db
      .select({ slug: products.slug, name: products.name, status: products.status })
      .from(products)
      .orderBy(asc(products.name)),
  ]);
  return {
    categories: CATEGORY_SLUGS.map((slug) => ({
      slug,
      subcategories: groupRows
        .filter((row) => row.category === slug)
        .map((row) => ({ slug: row.slug, name: row.name })),
    })),
    topics: topicRows,
    products: productRows,
  };
}
