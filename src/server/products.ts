import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { guideProducts, guideRevisions, guides, products, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  canTransition,
  PRODUCT_STATUSES,
  type ProductFieldErrors,
  productFieldErrors,
  type ProductInput,
  productInputSchema,
  type ProductStatus,
  READER_VISIBLE_FIELD_LABELS,
  READER_VISIBLE_FIELDS,
} from "@/lib/content/product-schema";
import { audit } from "@/server/audit";
import { type Actor, assertCan, can } from "@/server/auth/permissions";
import { isUniqueViolation } from "@/server/pg-error";
import { UserInputError } from "@/server/users";

/**
 * Products are never hard-deleted: guide_products and published revision snapshots refer to them.
 * Retiring is the supported way to take a product out of use.
 *
 * Lock order: the product row (`FOR UPDATE`) only. Publishing locks guides first and products
 * `FOR SHARE`; product updates never lock guides, so the two cannot deadlock.
 */

export const PRODUCT_PAGE_SIZE = 20;
export const PRODUCT_PAGE_MAX = 10_000;

export class ProductFormError extends Error {
  override name = "ProductFormError";
  readonly fieldErrors: ProductFieldErrors;
  constructor(message: string, fieldErrors: ProductFieldErrors = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

/** The change would alter published articles and the request did not confirm exactly those articles. */
export class ProductImpactError extends ProductFormError {
  override name = "ProductImpactError";
  readonly affected: PublishedUse[];
  constructor(message: string, affected: PublishedUse[]) {
    super(message, { confirmImpact: "Confirm the impact on the published articles listed." });
    this.affected = affected;
  }
}

export class ProductConflictError extends UserInputError {
  override name = "ProductConflictError";
  constructor() {
    super(
      "Someone else changed this product while you were editing. Your changes are still in the form; reload the page to see the latest version before saving again.",
    );
  }
}

function parse(raw: unknown): ProductInput {
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProductFormError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      productFieldErrors(parsed.error),
    );
  }
  return parsed.data;
}

function slugTaken(): ProductFormError {
  return new ProductFormError("Another product already uses that address.", {
    slug: "That address is already in use.",
  });
}

export type ProductQuery = { q?: string; status?: ProductStatus; page: number };

export function normaliseProductQuery(raw: {
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
}): ProductQuery {
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  const q = one(raw.q).slice(0, 100);
  const status = one(raw.status);
  const page = one(raw.page);
  return {
    ...(q ? { q } : {}),
    ...(PRODUCT_STATUSES.includes(status as ProductStatus) ? { status: status as ProductStatus } : {}),
    page: /^[1-9]\d{0,4}$/.test(page) ? Math.min(PRODUCT_PAGE_MAX, Number(page)) : 1,
  };
}

// Drizzle renders `${products.id}` as a bare "id" in single-table selects, which is ambiguous inside
// these subqueries, so the outer column is qualified explicitly.
const productIdColumn = sql.raw(`"products"."id"`);
const publishedUseCount = sql<number>`(
  select count(*)::int from ${guides} g
  join ${guideRevisions} r on r.id = g.published_revision_id
  where r.products @> jsonb_build_array(jsonb_build_object('productId', ${productIdColumn}::text))
)`;
const draftUseCount = sql<number>`(
  select count(*)::int from ${guideProducts} gp where gp.product_id = ${productIdColumn}
)`;

export type ProductListItem = {
  id: string;
  name: string;
  brand: string | null;
  slug: string;
  status: ProductStatus;
  verifiedOn: string | null;
  updatedAt: Date;
  publishedUses: number;
  draftUses: number;
};

export async function listProducts(
  db: Db,
  actor: Actor,
  query: ProductQuery,
): Promise<{ items: ProductListItem[]; total: number; page: number; pageSize: number }> {
  assertCan(actor, "product.manage");
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(products.status, query.status));
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(
      sql`(${products.name} ilike ${pattern} escape '\\' or ${products.brand} ilike ${pattern} escape '\\' or ${products.slug} ilike ${pattern} escape '\\')`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, Math.min(PRODUCT_PAGE_MAX, query.page));
  const [countRow, rows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(where),
    db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        slug: products.slug,
        status: products.status,
        verifiedOn: products.verifiedOn,
        updatedAt: products.updatedAt,
        publishedUses: publishedUseCount,
        draftUses: draftUseCount,
      })
      .from(products)
      .where(where)
      .orderBy(asc(products.name), asc(products.id))
      .limit(PRODUCT_PAGE_SIZE)
      .offset((page - 1) * PRODUCT_PAGE_SIZE),
  ]);
  return { items: rows, total: countRow[0]?.n ?? 0, page, pageSize: PRODUCT_PAGE_SIZE };
}

export type PublishedUse = { id: string; title: string; slug: string };

/** Articles whose live (published) revision recommends this product. */
export async function publishedUsage(db: Db, productId: string): Promise<PublishedUse[]> {
  return db
    .select({ id: guides.id, title: guideRevisions.title, slug: guideRevisions.slug })
    .from(guides)
    .innerJoin(guideRevisions, eq(guideRevisions.id, guides.publishedRevisionId))
    .where(
      sql`${guideRevisions.products} @> jsonb_build_array(jsonb_build_object('productId', ${productId}::text))`,
    )
    .orderBy(asc(guideRevisions.title));
}

export type ProductDetail = {
  id: string;
  version: number;
  status: ProductStatus;
  input: Record<keyof ProductInput, string>;
  createdAt: Date;
  updatedAt: Date;
  updatedByName: string | null;
  publishedUses: PublishedUse[];
  draftUses: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProduct(db: Db, actor: Actor, productId: string): Promise<ProductDetail | null> {
  if (!can(actor, "product.manage") || !UUID.test(productId)) return null;
  const [row] = await db
    .select({ product: products, updatedByName: users.name, draftUses: draftUseCount })
    .from(products)
    .leftJoin(users, eq(products.updatedBy, users.id))
    .where(eq(products.id, productId))
    .limit(1);
  if (!row) return null;
  const { product } = row;
  return {
    id: product.id,
    version: product.version,
    status: product.status,
    input: {
      name: product.name,
      slug: product.slug,
      brand: product.brand ?? "",
      summary: product.summary,
      merchantName: product.merchantName ?? "",
      productUrl: product.productUrl ?? "",
      verifiedOn: product.verifiedOn ?? "",
      status: product.status,
    },
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    updatedByName: row.updatedByName,
    publishedUses: await publishedUsage(db, product.id),
    draftUses: row.draftUses,
  };
}

function columns(input: ProductInput) {
  return {
    name: input.name,
    slug: input.slug,
    brand: input.brand,
    summary: input.summary,
    merchantName: input.merchantName,
    productUrl: input.productUrl,
    verifiedOn: input.verifiedOn,
    status: input.status,
  };
}

export async function createProduct(db: Db, actor: Actor, raw: unknown): Promise<{ id: string }> {
  assertCan(actor, "product.manage");
  const input = parse(raw);
  if (input.status === "retired") {
    throw new ProductFormError("New products start as draft or active.", {
      status: "Choose draft or active.",
    });
  }
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(products)
        .values({ ...columns(input), createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: products.id });
      if (!created) throw new Error("Product insert returned no row.");
      await audit(tx, {
        actorId: actor.id,
        action: "product.created",
        entityType: "product",
        entityId: created.id,
        details: { slug: input.slug, status: input.status },
      });
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "products_slug_key")) throw slugTaken();
    throw error;
  }
}

const STATUS_ACTION = {
  active: "product.activated",
  draft: "product.deactivated",
  retired: "product.retired",
} as const;

export type UpdateProductResult = {
  version: number;
  changed: boolean;
  statusChanged: boolean;
  /** Published articles whose product list changed visibly (status or details of a live product). */
  affected: PublishedUse[];
};

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map((id) => id.toLowerCase()));
  const right = new Set(b.map((id) => id.toLowerCase()));
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function quotedTitles(uses: PublishedUse[]): string {
  return uses.map((use) => `“${use.title}”`).join(", ");
}

function impactMessage(
  affected: PublishedUse[],
  leavingActive: boolean,
  visibleFields: readonly (typeof READER_VISIBLE_FIELDS)[number][],
  staleConfirmation: boolean,
): string {
  const one = affected.length === 1;
  const subject = one ? "A published article recommends" : `${affected.length} published articles recommend`;
  const pages = one ? "that page" : "those pages";
  const intro = staleConfirmation
    ? `The published articles using this product have changed since the page loaded. ${subject} it now: ${quotedTitles(affected)}.`
    : `${subject} this product: ${quotedTitles(affected)}.`;
  const effect = leavingActive
    ? `It will disappear from ${pages}, and ${one ? "that article" : "those articles"} cannot be republished until the product is replaced or active again.`
    : `Changing its ${visibleFields.map((field) => READER_VISIBLE_FIELD_LABELS[field]).join(", ")} updates ${pages} immediately, without a new article review.`;
  return `${intro} ${effect} Tick the confirmation to continue.`;
}

/**
 * `confirmedArticleIds` are the published articles the editor was shown and confirmed. A change
 * that alters what readers see on published articles (leaving active, or editing a reader-visible
 * field of an active product) is refused unless they match the articles affected right now.
 */
export async function updateProduct(
  db: Db,
  actor: Actor,
  productId: string,
  expectedVersion: number,
  raw: unknown,
  confirmedArticleIds: readonly string[],
): Promise<UpdateProductResult> {
  assertCan(actor, "product.manage");
  const input = parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
      if (!product) throw new UserInputError("Product not found.");
      if (product.version !== expectedVersion) throw new ProductConflictError();
      if (!canTransition(product.status, input.status)) {
        throw new ProductFormError(
          "A retired product must go back to draft and be re-checked before it can be active again.",
          { status: "Move it to draft first." },
        );
      }
      const before = columns({
        name: product.name,
        slug: product.slug,
        brand: product.brand,
        summary: product.summary,
        merchantName: product.merchantName,
        productUrl: product.productUrl,
        verifiedOn: product.verifiedOn,
        status: product.status,
      });
      const after = columns(input);
      const changedFields = (Object.keys(after) as Array<keyof typeof after>).filter(
        (key) => before[key] !== after[key],
      );
      if (changedFields.length === 0) {
        return { version: product.version, changed: false, statusChanged: false, affected: [] };
      }
      const statusChanged = product.status !== input.status;
      const wasActive = product.status === "active";
      const leavingActive = wasActive && input.status !== "active";
      const visibleFields = wasActive
        ? READER_VISIBLE_FIELDS.filter((key) => changedFields.includes(key))
        : [];
      const usage =
        wasActive && (leavingActive || visibleFields.length > 0) ? await publishedUsage(tx, product.id) : [];
      const affectedIds = usage.map((use) => use.id);
      if (usage.length > 0 && !sameIds(confirmedArticleIds, affectedIds)) {
        throw new ProductImpactError(
          impactMessage(usage, leavingActive, visibleFields, confirmedArticleIds.length > 0),
          usage,
        );
      }
      const nextVersion = product.version + 1;
      await tx
        .update(products)
        .set({ ...after, version: nextVersion, updatedBy: actor.id, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), eq(products.version, expectedVersion)));
      await audit(tx, {
        actorId: actor.id,
        action: "product.updated",
        entityType: "product",
        entityId: product.id,
        details: {
          version: nextVersion,
          changedFields,
          ...(visibleFields.length > 0 ? { readerVisibleFields: visibleFields } : {}),
          ...(usage.length > 0
            ? { publishedArticles: usage.length, affectedArticleIds: affectedIds, impactConfirmed: true }
            : {}),
        },
      });
      if (statusChanged) {
        await audit(tx, {
          actorId: actor.id,
          action: STATUS_ACTION[input.status],
          entityType: "product",
          entityId: product.id,
          details: { from: product.status, to: input.status, publishedArticles: usage.length },
        });
      }
      return { version: nextVersion, changed: true, statusChanged, affected: usage };
    });
  } catch (error) {
    if (isUniqueViolation(error, "products_slug_key")) throw slugTaken();
    throw error;
  }
}
