import { eq } from "drizzle-orm";
import type * as NextServer from "next/server";
import type * as React from "react";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guides } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Actor } from "@/server/auth/permissions";
import { createSession } from "@/server/auth/sessions";
import { guideContent } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  db: null as Db | null,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/db", () => ({ getDb: () => request.db }));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof NextServer>()),
  connection: async () => undefined,
}));

const { GET } = await import("@/app/media/[id]/[filename]/route");
const { proxy } = await import("@/proxy");
const { NextRequest } = await import("next/server");
const { SESSION_COOKIE } = await import("@/server/auth/request");
const { forgetMediaVisibility, isPublishedMedia } = await import("@/server/media-access");
const { deleteMedia, uploadMedia } = await import("@/server/media");
const { createGuide } = await import("@/server/guides/workflow");
const { decideReview, publishGuide, submitForReview, unpublishGuide } =
  await import("@/server/guides/review");
const { revalidatePublicContent } = await import("@/server/revalidate-public");
const { optimizerSource } = await import("@/lib/media/media-url");

let t: TestDb;
let owner: Actor;
let staffToken = "";

type Asset = { id: string; src: string };
const assets = {} as Record<
  "featured" | "inline" | "draftOnly" | "unreferenced" | "unpublished" | "deleted",
  Asset
>;
let unpublishedGuideId = "";

async function png(shade: number): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: shade, g: 40, b: 80 } },
  })
    .png()
    .toBuffer();
}

async function upload(shade: number, altText: string): Promise<Asset> {
  const stored = await uploadMedia(t.db, owner, {
    bytes: await png(shade),
    declaredType: "image/png",
    altText,
  });
  return { id: stored.id, src: stored.src };
}

async function publish(guideId: string) {
  const target = async () => {
    const [row] = await t.db.select().from(guides).where(eq(guides.id, guideId));
    return {
      guideId,
      version: row!.version,
      revisionId: row!.currentRevisionId!,
      contentHash: row!.contentHash,
    };
  };
  await submitForReview(t.db, owner, await target());
  await decideReview(t.db, owner, { ...(await target()), decision: "approved", notes: "" });
  await publishGuide(t.db, owner, await target());
}

function get(asset: Asset, headers: Record<string, string> = {}): Promise<Response> {
  const [, , id, filename] = asset.src.split("/");
  return GET(new Request(`http://localhost:3100${asset.src}`, { headers }), {
    params: Promise.resolve({ id: id!, filename: filename! }),
  });
}

function optimizer(url: string) {
  return proxy(
    new NextRequest(`http://localhost:3100/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`),
  );
}

beforeAll(async () => {
  t = await createTestDb();
  request.db = t.db;
  const user = await insertUser(t.db, "owner");
  owner = { id: user.id, role: user.role, name: user.name, email: user.email };
  staffToken = (await createSession(t.db, user.id, null)).token;

  assets.featured = await upload(10, "Featured image of a published article");
  assets.inline = await upload(20, "Inline image of a published article");
  assets.draftOnly = await upload(30, "Image used only by a draft");
  assets.unreferenced = await upload(40, "Image nobody uses yet");
  assets.unpublished = await upload(50, "Image of an unpublished article");
  assets.deleted = await upload(60, "Image that gets deleted");

  const live = await createGuide(
    t.db,
    owner,
    guideContent({
      slug: "media-live-article",
      featuredImageId: assets.featured.id,
      featuredImageAlt: "Featured image of a published article",
      body: `${guideContent().body}\n\n![Inline image of a published article](${assets.inline.src})`,
    }),
  );
  await publish(live.id);

  await createGuide(
    t.db,
    owner,
    guideContent({
      slug: "media-draft-article",
      featuredImageId: assets.draftOnly.id,
      featuredImageAlt: "Image used only by a draft",
    }),
  );

  const gone = await createGuide(
    t.db,
    owner,
    guideContent({
      slug: "media-unpublished-article",
      featuredImageId: assets.unpublished.id,
      featuredImageAlt: "Image of an unpublished article",
    }),
  );
  await publish(gone.id);
  unpublishedGuideId = gone.id;

  await deleteMedia(t.db, owner, assets.deleted.id);
  forgetMediaVisibility();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  request.cookies.clear();
});

describe("public media route", () => {
  it("serves images of published articles with a short, revalidated public cache", async () => {
    for (const asset of [assets.featured, assets.inline, assets.unpublished]) {
      const response = await get(asset);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
      expect(response.headers.get("cache-control")).not.toContain("immutable");
      expect(response.headers.get("content-type")).toBe("image/webp");
    }
    const first = await get(assets.featured);
    const etag = first.headers.get("etag")!;
    const revalidated = await get(assets.featured, { "if-none-match": etag });
    expect(revalidated.status).toBe(304);
  });

  it("stops serving an article's images once it is unpublished", async () => {
    const [live] = await t.db.select().from(guides).where(eq(guides.id, unpublishedGuideId));
    await unpublishGuide(t.db, owner, {
      guideId: unpublishedGuideId,
      publishedRevisionId: live!.publishedRevisionId!,
      reason: "Testing media visibility.",
      confirmed: true,
    });
    // Within the cache window the old answer stands until the post-commit refresh clears it.
    expect(await isPublishedMedia(t.db, assets.unpublished.id)).toBe(true);
    revalidatePublicContent({ slug: "media-unpublished-article" });
    const response = await get(assets.unpublished);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await get(assets.featured)).status).toBe(200);
  });

  it("does not expose draft-only, unreferenced, deleted or misnamed assets to signed-out visitors", async () => {
    for (const asset of [assets.draftOnly, assets.unreferenced, assets.deleted, assets.unpublished]) {
      const response = await get(asset);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("etag")).toBeNull();
    }
    const misnamed = await GET(new Request("http://localhost:3100/media/x/y"), {
      params: Promise.resolve({ id: assets.featured.id, filename: "other.png" }),
    });
    expect(misnamed.status).toBe(404);
  });

  it("lets signed-in staff see unpublished library images with a private cache", async () => {
    request.cookies.set(SESSION_COOKIE, staffToken);
    for (const asset of [assets.draftOnly, assets.unreferenced, assets.unpublished]) {
      const response = await get(asset);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-cache");
    }
    expect((await get(assets.deleted)).status).toBe(404);
    request.cookies.set(SESSION_COOKIE, "not-a-real-session");
    expect((await get(assets.draftOnly)).status).toBe(404);
  });
});

describe("image optimizer gate", () => {
  it("lets published library images and non-library images through", async () => {
    for (const url of [assets.featured.src, assets.inline.src, "/images/hero.png"]) {
      const response = await optimizer(url);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("blocks unpublished, unreferenced and encoded variants of library images", async () => {
    const [, , draftId, draftName] = assets.draftOnly.src.split("/");
    for (const url of [
      assets.draftOnly.src,
      assets.unreferenced.src,
      assets.unpublished.src,
      assets.deleted.src,
      `/images/../media/${draftId}/${draftName}`,
      `/%6Dedia/${draftId}/${draftName}`,
      `/media/${draftId!.toUpperCase()}/${draftName}`,
      "/media/not-a-uuid/file.png",
    ]) {
      const response = await optimizer(url);
      expect(response.status, url).toBe(404);
      expect(response.headers.get("x-middleware-next")).toBeNull();
    }
  });

  it("classifies optimizer sources", () => {
    expect(optimizerSource(null)).toEqual({ kind: "other" });
    expect(optimizerSource("https://example.com/media/x/y.png")).toEqual({ kind: "other" });
    expect(optimizerSource("/images/a.png")).toEqual({ kind: "other" });
    expect(optimizerSource("/media/%E0%A4%A/x.png")).toEqual({ kind: "invalid-media" });
    expect(optimizerSource(assets.featured.src)).toEqual({ kind: "media", id: assets.featured.id });
  });
});
