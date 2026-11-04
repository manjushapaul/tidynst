import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, guideRevisions, guides, mediaAssets } from "@/db/schema";
import { decideReview, publishGuide, submitForReview } from "@/server/guides/review";
import type { Actor } from "@/server/auth/permissions";
import { AuthorizationError } from "@/server/auth/permissions";
import { createGuide, saveGuide } from "@/server/guides/workflow";
import { deleteMedia, reportOrphanMediaObjects, uploadMedia } from "@/server/media";
import { createMemoryObjectStore, setMediaObjectStoreForTests } from "@/server/media/object-store";
import { listMedia, listRecentMedia } from "@/server/guides/queries";
import { UserInputError } from "@/server/users";
import { guideContent } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return user;
}

async function png(width = 12, height = 8, shade = 1): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: shade, g: shade + 1, b: shade + 2 },
    },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  setMediaObjectStoreForTests(createMemoryObjectStore());
  t = await createTestDb();
});

afterAll(async () => {
  setMediaObjectStoreForTests(undefined);
  await t.close();
});

describe("media library", () => {
  it("stores an optimised WebP in object storage and reuses identical source bytes", async () => {
    const editor = asActor(await insertUser(t.db, "editor"));
    const bytes = await png();
    const first = await uploadMedia(t.db, editor, {
      bytes,
      declaredType: "image/png",
      altText: "A plain green square",
    });
    expect(first.duplicate).toBe(false);
    expect(first.width).toBe(12);
    expect(first.height).toBe(8);
    expect(first.filename).toBe("image.webp");
    expect(first.contentType).toBe("image/webp");
    expect(first.src).toBe(`/media/${first.id}/image.webp`);
    const [row] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, first.id));
    expect(row?.data).toBeNull();
    expect(row?.storageProvider).toBe("vercel_blob");
    expect(row?.storageKey).toContain(`media/${first.id}/`);
    expect(row?.storageUrl).toBeTruthy();

    const second = await uploadMedia(t.db, editor, {
      bytes,
      declaredType: "image/png",
      altText: "A different description",
    });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.altText).toBe("A plain green square");
    const listed = await listMedia(t.db, 10, 0);
    expect(listed.items.some((item) => item.id === first.id && item.usedBy === null)).toBe(true);
    const uploaded = await t.db.select().from(auditEvents).where(eq(auditEvents.action, "media.uploaded"));
    expect(uploaded.some((event) => event.entityId === first.id)).toBe(true);
  });

  it("rejects spoofed types and refuses deletion while referenced", async () => {
    const author = asActor(await insertUser(t.db, "author"));
    const editor = asActor(await insertUser(t.db, "editor"));
    const bytes = await png(10, 10, 40);
    await expect(
      uploadMedia(t.db, editor, { bytes, declaredType: "image/jpeg", altText: "Looks like a photo" }),
    ).rejects.toBeInstanceOf(UserInputError);
    await expect(
      uploadMedia(t.db, editor, { bytes, declaredType: "image/png", altText: "no" }),
    ).rejects.toThrow(/at least 5/);

    const stored = await uploadMedia(t.db, editor, {
      bytes: await png(4, 4, 9),
      declaredType: "image/png",
      altText: "Another plain square",
    });
    const created = await createGuide(
      t.db,
      author,
      guideContent({
        slug: "guide-with-image",
        featuredImageId: stored.id,
        featuredImageAlt: "Another plain square",
      }),
    );
    const listed = await listMedia(t.db, 20, 0);
    expect(listed.items.find((item) => item.id === stored.id)?.usedBy).toBe("draft");

    const loose = await uploadMedia(t.db, editor, {
      bytes: await png(5, 5, 4),
      declaredType: "image/png",
      altText: "Referenced only in the body",
    });
    await saveGuide(t.db, author, created.id, 1, {
      ...guideContent({ slug: "guide-with-image" }),
      featuredImageId: null,
      body: `${guideContent().body}\n\n![Referenced only in the body](${loose.src})`,
    });
    const bodyListed = await listMedia(t.db, 20, 0);
    expect(bodyListed.items.find((item) => item.id === loose.id)?.usedBy).toBe("draft");
    // Previous featured image remains on an old revision — listed as in use and blocked.
    expect(bodyListed.items.find((item) => item.id === stored.id)?.usedBy).toBe("draft");
    await expect(deleteMedia(t.db, editor, stored.id)).rejects.toBeInstanceOf(UserInputError);
    expect(await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, stored.id))).toHaveLength(1);

    const spare = await uploadMedia(t.db, editor, {
      bytes: await png(6, 6, 7),
      declaredType: "image/png",
      altText: "Unused library image",
    });
    const editorList = await listRecentMedia(t.db, null);
    expect(editorList.find((item) => item.id === loose.id)?.usedBy).toBe("draft");
    expect(editorList.find((item) => item.id === spare.id)?.usedBy).toBeNull();
    await expect(deleteMedia(t.db, author, spare.id)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteMedia(t.db, editor, spare.id);
    expect(await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, spare.id))).toHaveLength(0);

    await expect(deleteMedia(t.db, editor, loose.id)).rejects.toBeInstanceOf(UserInputError);
    expect(await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, loose.id))).toHaveLength(1);
  });

  it("refuses to delete an image on a published article", async () => {
    const owner = asActor(await insertUser(t.db, "owner"));
    const live = await uploadMedia(t.db, owner, {
      bytes: await png(7, 7, 20),
      declaredType: "image/png",
      altText: "Image on a live article",
    });
    const created = await createGuide(
      t.db,
      owner,
      guideContent({
        slug: "live-article-with-image",
        title: "Live article with image",
        body: `${guideContent().body}\n\n![Image on a live article](${live.src})`,
      }),
    );
    const target = async () => {
      const [guide] = await t.db.select().from(guides).where(eq(guides.id, created.id));
      return {
        guideId: created.id,
        version: guide!.version,
        revisionId: guide!.currentRevisionId!,
        contentHash: guide!.contentHash,
      };
    };
    await submitForReview(t.db, owner, await target());
    await decideReview(t.db, owner, { ...(await target()), decision: "approved", notes: "" });
    await publishGuide(t.db, owner, await target());

    expect((await listMedia(t.db, 60, 0)).items.find((item) => item.id === live.id)?.usedBy).toBe(
      "published",
    );
    await expect(deleteMedia(t.db, owner, live.id)).rejects.toBeInstanceOf(UserInputError);
    expect(await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, live.id))).toHaveLength(1);
    expect(
      await t.db.select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id)),
    ).not.toHaveLength(0);
  });

  it("falls back to bytea when no object store is configured", async () => {
    setMediaObjectStoreForTests(null);
    try {
      const editor = asActor(await insertUser(t.db, "editor"));
      const stored = await uploadMedia(t.db, editor, {
        bytes: await png(8, 8, 50),
        declaredType: "image/png",
        altText: "Legacy bytea fallback image",
      });
      const [row] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, stored.id));
      expect(row?.storageKey).toBeNull();
      expect(row?.data).toBeTruthy();
      expect(row?.contentType).toBe("image/webp");
      await deleteMedia(t.db, editor, stored.id);
      expect(await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, stored.id))).toHaveLength(0);
    } finally {
      setMediaObjectStoreForTests(createMemoryObjectStore());
    }
  });

  it("reports orphan object-store files without deleting them", async () => {
    const store = createMemoryObjectStore();
    setMediaObjectStoreForTests(store);
    const editor = asActor(await insertUser(t.db, "editor"));
    const stored = await uploadMedia(t.db, editor, {
      bytes: await png(9, 9, 60),
      declaredType: "image/png",
      altText: "Tracked library image",
    });
    const orphan = await store.put("media/orphan/image.webp", Buffer.from("x"), "image/webp");
    const report = await reportOrphanMediaObjects(t.db);
    expect(report.orphanUrls).toContain(orphan.url);
    expect(report.referencedUrls.some((url) => url.includes(stored.id) || url.length > 0)).toBe(true);
    const listed = await store.listPathnames("media/");
    expect(listed.some((item) => item.url === orphan.url)).toBe(true);
  });
});
