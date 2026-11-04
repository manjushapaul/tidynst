import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, products } from "@/db/schema";
import { affiliateLinksEnabled } from "@/lib/affiliate";
import { canTransition } from "@/lib/content/product-schema";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { publishGuide, submitForReview, decideReview } from "@/server/guides/review";
import { createGuide } from "@/server/guides/workflow";
import {
  createProduct,
  getProduct,
  listProducts,
  normaliseProductQuery,
  ProductConflictError,
  ProductFormError,
  ProductImpactError,
  updateProduct,
} from "@/server/products";
import { getPublishedGuide } from "@/server/public-content";
import { guideContent } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
const db = () => t.db;
let owner: Actor;
let editor: Actor;
let author: Actor;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  editor = asActor(await insertUser(t.db, "editor"));
  author = asActor(await insertUser(t.db, "author"));
});

afterAll(async () => {
  await t.close();
});

function input(overrides: Record<string, string> = {}) {
  return {
    name: "Slim spice rack",
    slug: "slim-spice-rack",
    brand: "",
    summary: "Narrow rack for test fixtures; holds small spice tins near the stove.",
    merchantName: "",
    productUrl: "https://shop.example.com/rack",
    verifiedOn: "2026-02-01",
    status: "draft",
    ...overrides,
  };
}

async function formError(promise: Promise<unknown>): Promise<ProductFormError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ProductFormError);
  return error as ProductFormError;
}

describe("product validation", () => {
  it("rejects non-HTTPS links, embedded credentials and affiliate tracking", async () => {
    expect(affiliateLinksEnabled()).toBe(false);
    expect(
      (
        await formError(
          createProduct(db(), owner, input({ slug: "p-http", productUrl: "http://shop.example.com/x" })),
        )
      ).fieldErrors.productUrl,
    ).toMatch(/https/);
    expect(
      (
        await formError(
          createProduct(
            db(),
            owner,
            input({ slug: "p-cred", productUrl: "https://user:pw@shop.example.com/x" }),
          ),
        )
      ).fieldErrors.productUrl,
    ).toMatch(/username or password/);
    expect(
      (
        await formError(
          createProduct(
            db(),
            owner,
            input({ slug: "p-aff", productUrl: "https://shop.example.com/x?tag=abc-21" }),
          ),
        )
      ).fieldErrors.productUrl,
    ).toMatch(/affiliate/i);
    expect(await db().select().from(products).where(eq(products.slug, "p-aff"))).toHaveLength(0);
  });

  it("requires a verification date to be active and rejects future dates", async () => {
    expect(
      (
        await formError(
          createProduct(db(), owner, input({ slug: "p-active", status: "active", verifiedOn: "" })),
        )
      ).fieldErrors.verifiedOn,
    ).toMatch(/date you checked/);
    expect(
      (await formError(createProduct(db(), owner, input({ slug: "p-future", verifiedOn: "2999-01-01" }))))
        .fieldErrors.verifiedOn,
    ).toMatch(/future/);
    expect(
      (await formError(createProduct(db(), owner, input({ slug: "p-bad-date", verifiedOn: "2026-02-31" }))))
        .fieldErrors.verifiedOn,
    ).toMatch(/valid date/);
    expect(
      (await formError(createProduct(db(), owner, input({ slug: "p-retired", status: "retired" }))))
        .fieldErrors.status,
    ).toBeTruthy();
  });

  it("reports a duplicate address as a field error", async () => {
    await createProduct(db(), owner, input({ slug: "p-duplicate" }));
    expect(
      (await formError(createProduct(db(), owner, input({ slug: "p-duplicate" })))).fieldErrors.slug,
    ).toMatch(/already in use/);
  });
});

describe("product permissions, listing and updates", () => {
  it("allows owners and editors but not authors", async () => {
    await expect(createProduct(db(), author, input({ slug: "p-author" }))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(listProducts(db(), author, { page: 1 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(await getProduct(db(), author, "00000000-0000-4000-8000-000000000000")).toBeNull();
    const created = await createProduct(db(), editor, input({ slug: "p-editor" }));
    expect(created.id).toBeTruthy();
  });

  it("searches, filters by status and paginates in the database", async () => {
    for (let index = 0; index < 22; index += 1) {
      await createProduct(db(), owner, input({ slug: `p-page-${index}`, name: `Paged drawer ${index}` }));
    }
    const first = await listProducts(db(), owner, { q: "Paged drawer", page: 1 });
    const second = await listProducts(db(), owner, { q: "Paged drawer", page: 2 });
    expect(first.total).toBe(22);
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(2);
    expect((await listProducts(db(), owner, { q: "Paged drawer", status: "active", page: 1 })).total).toBe(0);
    expect(normaliseProductQuery({ status: "deleted", page: "-1", q: " x " })).toEqual({ q: "x", page: 1 });
    expect((await listProducts(db(), owner, { q: "100%_", page: 1 })).total).toBe(0);
  });

  it("uses optimistic concurrency and records audit events", async () => {
    const created = await createProduct(db(), owner, input({ slug: "p-version" }));
    const saved = await updateProduct(
      db(),
      owner,
      created.id,
      1,
      input({ slug: "p-version", name: "Renamed rack" }),
      [],
    );
    expect(saved).toMatchObject({ version: 2, changed: true });
    await expect(
      updateProduct(db(), editor, created.id, 1, input({ slug: "p-version", name: "Stale rename" }), []),
    ).rejects.toBeInstanceOf(ProductConflictError);
    const [stored] = await db().select().from(products).where(eq(products.id, created.id));
    expect(stored?.name).toBe("Renamed rack");
    const events = await db()
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, "product"), eq(auditEvents.entityId, created.id)));
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["product.created", "product.updated"]),
    );
  });

  it("enforces status transitions: retired products go back to draft before becoming active", async () => {
    expect(canTransition("retired", "active")).toBe(false);
    expect(canTransition("retired", "draft")).toBe(true);
    const created = await createProduct(db(), owner, input({ slug: "p-transition", status: "active" }));
    await updateProduct(db(), owner, created.id, 1, input({ slug: "p-transition", status: "retired" }), []);
    await expect(
      updateProduct(db(), owner, created.id, 2, input({ slug: "p-transition", status: "active" }), []),
    ).rejects.toBeInstanceOf(ProductFormError);
    await updateProduct(db(), owner, created.id, 2, input({ slug: "p-transition", status: "draft" }), []);
    await updateProduct(db(), owner, created.id, 3, input({ slug: "p-transition", status: "active" }), []);
    const actions = (
      await db()
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, "product"), eq(auditEvents.entityId, created.id)))
    ).map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining(["product.retired", "product.deactivated", "product.activated"]),
    );
  });
});

describe("retiring a product used by a published article", () => {
  it("requires confirmation, lists the impact, hides the product publicly and blocks republishing", async () => {
    const product = await createProduct(db(), owner, input({ slug: "p-live", status: "active" }));
    const article = await createGuide(
      db(),
      owner,
      guideContent({
        slug: "article-with-live-product",
        products: [{ productId: product.id, note: "Fits a narrow gap." }],
      }),
    );
    const { guides } = await import("@/db/schema");
    const target = async () => {
      const [row] = await db().select().from(guides).where(eq(guides.id, article.id));
      return {
        guideId: article.id,
        version: row!.version,
        revisionId: row!.currentRevisionId!,
        contentHash: row!.contentHash,
      };
    };
    await submitForReview(db(), owner, await target());
    await decideReview(db(), owner, { ...(await target()), decision: "approved", notes: "" });
    await publishGuide(db(), owner, await target());
    expect((await getPublishedGuide(db(), "article-with-live-product"))?.products).toHaveLength(1);
    expect((await getProduct(db(), owner, product.id))?.publishedUses.map((use) => use.id)).toEqual([
      article.id,
    ]);
    const listed = (await listProducts(db(), owner, { q: "p-live", page: 1 })).items[0];
    expect(listed).toMatchObject({ publishedUses: 1, draftUses: 1 });

    const blocked = await formError(
      updateProduct(db(), owner, product.id, 1, input({ slug: "p-live", status: "retired" }), []),
    );
    expect(blocked.fieldErrors.confirmImpact).toBeTruthy();
    expect(blocked.message).toContain("How to organise a small kitchen platform");
    const [unchanged] = await db().select().from(products).where(eq(products.id, product.id));
    expect(unchanged?.status).toBe("active");

    const retired = await updateProduct(
      db(),
      owner,
      product.id,
      1,
      input({ slug: "p-live", status: "retired" }),
      [article.id],
    );
    expect(retired.affected.map((use) => use.id)).toEqual([article.id]);
    expect((await getPublishedGuide(db(), "article-with-live-product"))?.products).toHaveLength(0);
    const [retiredAudit] = await db()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "product.retired"), eq(auditEvents.entityId, product.id)));
    expect(retiredAudit?.details).toMatchObject({ from: "active", to: "retired", publishedArticles: 1 });
  });

  it("requires confirmation of the exact published articles before reader-visible edits go live", async () => {
    const { guides } = await import("@/db/schema");
    const publishWith = async (productId: string, slug: string, title: string) => {
      const article = await createGuide(
        db(),
        owner,
        guideContent({ slug, title, products: [{ productId, note: null }] }),
      );
      const target = async () => {
        const [row] = await db().select().from(guides).where(eq(guides.id, article.id));
        return {
          guideId: article.id,
          version: row!.version,
          revisionId: row!.currentRevisionId!,
          contentHash: row!.contentHash,
        };
      };
      await submitForReview(db(), owner, await target());
      await decideReview(db(), owner, { ...(await target()), decision: "approved", notes: "" });
      await publishGuide(db(), owner, await target());
      return article.id;
    };
    const base = input({ slug: "p-visible", status: "active" });
    const product = await createProduct(db(), owner, base);
    const first = await publishWith(product.id, "visible-edit-first", "First article showing the rack");
    const liveName = async () =>
      (await getPublishedGuide(db(), "visible-edit-first"))?.products[0]?.name ?? null;

    for (const change of [
      { name: "Renamed spice rack" },
      { summary: "A different reason to recommend this rack, written for the test." },
      { productUrl: "https://shop.example.com/other-rack" },
      { brand: "Other brand" },
      { merchantName: "Other shop" },
    ]) {
      const refused = await formError(updateProduct(db(), editor, product.id, 1, { ...base, ...change }, []));
      expect(refused).toBeInstanceOf(ProductImpactError);
      expect((refused as ProductImpactError).affected.map((use) => use.id)).toEqual([first]);
      expect(refused.message).toContain("First article showing the rack");
      expect(refused.message).toMatch(/without a new article review/);
    }
    expect(await liveName()).toBe("Slim spice rack");

    const forged = await formError(
      updateProduct(db(), editor, product.id, 1, { ...base, name: "Renamed spice rack" }, [
        "11111111-2222-4333-8444-555555555555",
      ]),
    );
    expect(forged).toBeInstanceOf(ProductImpactError);
    expect(forged.message).toMatch(/changed since the page loaded/);

    const second = await publishWith(product.id, "visible-edit-second", "Second article showing the rack");
    const stale = await formError(
      updateProduct(db(), editor, product.id, 1, { ...base, name: "Renamed spice rack" }, [first]),
    );
    expect(stale.message).toContain("Second article showing the rack");
    expect(await liveName()).toBe("Slim spice rack");

    const notVisible = await updateProduct(
      db(),
      editor,
      product.id,
      1,
      { ...base, verifiedOn: "2026-02-02" },
      [],
    );
    expect(notVisible).toMatchObject({ version: 2, changed: true, affected: [] });

    const saved = await updateProduct(
      db(),
      editor,
      product.id,
      2,
      {
        ...base,
        verifiedOn: "2026-02-02",
        name: "Renamed spice rack",
        productUrl: "https://shop.example.com/r2",
      },
      [second, first],
    );
    expect(saved.affected.map((use) => use.id).sort()).toEqual([first, second].sort());
    expect(await liveName()).toBe("Renamed spice rack");

    const [updated] = await db()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "product.updated"), eq(auditEvents.entityId, product.id)))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    expect(updated?.details).toMatchObject({
      version: 3,
      readerVisibleFields: ["name", "productUrl"],
      publishedArticles: 2,
      impactConfirmed: true,
    });
    expect(
      [...((updated?.details as { affectedArticleIds: string[] }).affectedArticleIds ?? [])].sort(),
    ).toEqual([first, second].sort());
    expect(JSON.stringify(updated?.details)).not.toContain("shop.example.com");
  });

  it("does not ask for confirmation when the product is not live on any published article", async () => {
    const product = await createProduct(db(), owner, input({ slug: "p-unused", status: "active" }));
    const saved = await updateProduct(
      db(),
      owner,
      product.id,
      1,
      input({ slug: "p-unused", status: "active", name: "Renamed unused rack" }),
      [],
    );
    expect(saved).toMatchObject({ changed: true, affected: [] });
  });

  it("cannot be hard-deleted while articles reference it", async () => {
    const product = await createProduct(db(), owner, input({ slug: "p-no-delete" }));
    await createGuide(
      db(),
      owner,
      guideContent({ slug: "references-no-delete", products: [{ productId: product.id, note: null }] }),
    );
    await expect(db().delete(products).where(eq(products.id, product.id))).rejects.toThrow();
    expect(await db().select().from(products).where(eq(products.id, product.id))).toHaveLength(1);
  });
});
