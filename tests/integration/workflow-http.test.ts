import { eq } from "drizzle-orm";
import type * as React from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guides, products } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession, validateSession } from "@/server/auth/sessions";
import { guideContent } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

const request = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  db: null as Db | null,
  failPublicRefresh: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => request.headers.get(name.toLowerCase()) ?? null }),
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => request.cookies.set(name, value),
    delete: ({ name }: { name: string }) => request.cookies.delete(name),
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    if (request.failPublicRefresh && !path.startsWith("/admin")) throw new Error("cache unavailable");
  },
}));
vi.mock("@/server/db", () => ({ getDb: () => request.db }));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  cache: <T>(fn: T) => fn,
}));

const {
  approveReviewAction,
  publishGuideAction,
  requestChangesAction,
  submitForReviewAction,
  unpublishGuideAction,
} = await import("@/app/admin/(panel)/guides/review-actions");
const { createProductAction, updateProductAction } = await import("@/app/admin/(panel)/products/actions");
const { SESSION_COOKIE } = await import("@/server/auth/request");
const { createGuide } = await import("@/server/guides/workflow");

let t: TestDb;
const sessions: Record<"owner" | "author", { token: string; csrf: string; userId: string }> = {
  owner: { token: "", csrf: "", userId: "" },
  author: { token: "", csrf: "", userId: "" },
};

beforeAll(async () => {
  t = await createTestDb();
  request.db = t.db;
  for (const role of ["owner", "author"] as const) {
    const user = await insertUser(t.db, role);
    const session = await createSession(t.db, user.id, null);
    sessions[role] = {
      token: session.token,
      csrf: (await validateSession(t.db, session.token))!.csrfToken,
      userId: user.id,
    };
  }
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  request.failPublicRefresh = false;
  request.headers.clear();
  request.cookies.clear();
  request.headers.set("host", "localhost:3100");
  request.headers.set("origin", "http://localhost:3100");
  signInAs("owner");
});

function signInAs(role: "owner" | "author") {
  request.cookies.set(SESSION_COOKIE, sessions[role].token);
}

function form(role: "owner" | "author", fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  if (!data.has("csrf")) data.set("csrf", sessions[role].csrf);
  return data;
}

async function targetFields(guideId: string): Promise<Record<string, string>> {
  const [guide] = await t.db.select().from(guides).where(eq(guides.id, guideId));
  return {
    guideId,
    version: String(guide!.version),
    revisionId: guide!.currentRevisionId!,
    contentHash: guide!.contentHash,
  };
}

async function ownerArticle(slug: string) {
  const owner = (await validateSession(t.db, sessions.owner.token))!.user;
  return createGuide(t.db, owner, guideContent({ slug }));
}

describe("review and publish actions", () => {
  it("runs the owner's submit → self-approve → publish → unpublish flow through the actions", async () => {
    const created = await ownerArticle("http-owner-flow");
    expect((await submitForReviewAction(null, form("owner", await targetFields(created.id))))?.ok).toBe(true);
    const approved = await approveReviewAction(null, form("owner", await targetFields(created.id)));
    expect(approved).toMatchObject({ ok: true });
    expect(approved?.message).toMatch(/self-approval/);
    const published = await publishGuideAction(null, form("owner", await targetFields(created.id)));
    expect(published).toMatchObject({ ok: true, message: "Published. The approved revision is now live." });

    const [live] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    const missingConfirm = await unpublishGuideAction(
      null,
      form("owner", {
        guideId: created.id,
        publishedRevisionId: live!.publishedRevisionId!,
        reason: "Needs a rewrite now.",
      }),
    );
    expect(missingConfirm?.ok).toBe(false);
    const unpublished = await unpublishGuideAction(
      null,
      form("owner", {
        guideId: created.id,
        publishedRevisionId: live!.publishedRevisionId!,
        reason: "Needs a rewrite now.",
        confirm: "yes",
      }),
    );
    expect(unpublished?.ok).toBe(true);
    const [after] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(after?.publishedRevisionId).toBeNull();
  });

  it("reports a publish as successful, with a warning, when the public refresh fails after commit", async () => {
    const created = await ownerArticle("http-refresh-failure");
    await submitForReviewAction(null, form("owner", await targetFields(created.id)));
    await approveReviewAction(null, form("owner", await targetFields(created.id)));
    request.failPublicRefresh = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await publishGuideAction(null, form("owner", await targetFields(created.id)));
    errors.mockRestore();
    expect(result?.ok).toBe(true);
    expect(result?.message).toMatch(/could not be refreshed/);
    const [guide] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.publishedRevisionId).toBe(guide?.currentRevisionId);
  });

  it("rejects a missing CSRF token, a cross-origin request and a missing session", async () => {
    const created = await ownerArticle("http-csrf");
    await submitForReviewAction(null, form("owner", await targetFields(created.id)));
    await approveReviewAction(null, form("owner", await targetFields(created.id)));

    const badToken = await publishGuideAction(
      null,
      form("owner", { ...(await targetFields(created.id)), csrf: "wrong" }),
    );
    expect(badToken).toMatchObject({ ok: false, message: expect.stringMatching(/expired/) });

    request.headers.set("origin", "https://evil.example");
    expect((await publishGuideAction(null, form("owner", await targetFields(created.id))))?.ok).toBe(false);

    request.headers.set("origin", "http://localhost:3100");
    request.cookies.clear();
    expect((await publishGuideAction(null, form("owner", await targetFields(created.id))))?.ok).toBe(false);

    const [guide] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.publishedRevisionId).toBeNull();
  });

  it("denies authors review, publish and product actions", async () => {
    const created = await ownerArticle("http-author-denied");
    await submitForReviewAction(null, form("owner", await targetFields(created.id)));
    signInAs("author");
    expect(await approveReviewAction(null, form("author", await targetFields(created.id)))).toMatchObject({
      ok: false,
      message: "You do not have permission to do that.",
    });
    expect(
      (
        await requestChangesAction(
          null,
          form("author", { ...(await targetFields(created.id)), notes: "Please fix it." }),
        )
      )?.ok,
    ).toBe(false);
    expect((await publishGuideAction(null, form("author", await targetFields(created.id))))?.ok).toBe(false);
    expect(
      (
        await createProductAction(
          null,
          form("author", {
            name: "Author product",
            slug: "author-product",
            summary: "Should never be created by an author account.",
            status: "draft",
          }),
        )
      )?.ok,
    ).toBe(false);
    expect(await t.db.select().from(products).where(eq(products.slug, "author-product"))).toHaveLength(0);
  });

  it("rejects tampered or malformed review targets", async () => {
    const created = await ownerArticle("http-tampered");
    await submitForReviewAction(null, form("owner", await targetFields(created.id)));
    const fields = await targetFields(created.id);
    expect(
      await approveReviewAction(null, form("owner", { ...fields, contentHash: "not-a-hash" })),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/out of date/),
    });
    expect(
      await approveReviewAction(null, form("owner", { ...fields, contentHash: "f".repeat(64) })),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/changed after you opened it/) });
  });
});

describe("product actions", () => {
  it("creates and updates a product with field errors and version checks", async () => {
    const invalid = await createProductAction(
      null,
      form("owner", {
        name: "Door hook rail",
        slug: "door-hook-rail",
        summary: "Rail of hooks for the back of a door; test data only.",
        productUrl: "http://shop.example.com/hooks",
        status: "draft",
      }),
    );
    expect(invalid?.ok).toBe(false);
    expect(invalid?.fieldErrors?.productUrl).toMatch(/https/);

    const created = await createProductAction(
      null,
      form("owner", {
        name: "Door hook rail",
        slug: "door-hook-rail",
        summary: "Rail of hooks for the back of a door; test data only.",
        productUrl: "https://shop.example.com/hooks",
        status: "draft",
      }),
    );
    expect(created?.ok).toBe(true);
    const id = created!.redirectTo!.split("/").pop()!;
    const fields = {
      productId: id,
      version: "1",
      name: "Door hook rail",
      slug: "door-hook-rail",
      summary: "Rail of hooks for the back of a door; test data only.",
      productUrl: "https://shop.example.com/hooks",
      verifiedOn: "2026-03-01",
      status: "active",
    };
    expect(await updateProductAction(null, form("owner", fields))).toMatchObject({ ok: true, version: 2 });
    expect((await updateProductAction(null, form("owner", { ...fields, name: "Stale name" })))?.ok).toBe(
      false,
    );
  });

  it("refuses a direct action that edits a live product's details without confirming the articles", async () => {
    const created = await createProductAction(
      null,
      form("owner", {
        name: "Over-door basket",
        slug: "over-door-basket",
        summary: "Basket that hangs over a door; synthetic test data only.",
        productUrl: "https://shop.example.com/basket",
        verifiedOn: "2026-03-01",
        status: "active",
      }),
    );
    const productId = created!.redirectTo!.split("/").pop()!;
    const owner = (await validateSession(t.db, sessions.owner.token))!.user;
    const article = await createGuide(
      t.db,
      owner,
      guideContent({ slug: "http-live-product", products: [{ productId, note: null }] }),
    );
    await submitForReviewAction(null, form("owner", await targetFields(article.id)));
    await approveReviewAction(null, form("owner", await targetFields(article.id)));
    await publishGuideAction(null, form("owner", await targetFields(article.id)));

    const fields = {
      productId,
      version: "1",
      name: "Renamed basket",
      slug: "over-door-basket",
      summary: "Basket that hangs over a door; synthetic test data only.",
      productUrl: "https://shop.example.com/basket",
      verifiedOn: "2026-03-01",
      status: "active",
    };
    const unconfirmed = await updateProductAction(null, form("owner", fields));
    expect(unconfirmed).toMatchObject({ ok: false, fieldErrors: { confirmImpact: expect.any(String) } });

    const tickOnly = await updateProductAction(null, form("owner", { ...fields, confirmImpact: "yes" }));
    expect(tickOnly?.ok).toBe(false);

    const idsWithoutTick = form("owner", fields);
    idsWithoutTick.append("impactArticleIds", article.id);
    expect((await updateProductAction(null, idsWithoutTick))?.ok).toBe(false);

    const [unchanged] = await t.db.select().from(products).where(eq(products.id, productId));
    expect(unchanged?.name).toBe("Over-door basket");

    const confirmed = form("owner", { ...fields, confirmImpact: "yes" });
    confirmed.append("impactArticleIds", article.id);
    expect(await updateProductAction(null, confirmed)).toMatchObject({ ok: true, version: 2 });
    const [renamed] = await t.db.select().from(products).where(eq(products.id, productId));
    expect(renamed?.name).toBe("Renamed basket");
  });
});
