import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guideRevisions, guides } from "@/db/schema";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import type { Actor } from "@/server/auth/permissions";
import { getDraftPreview, getEditableGuide, getRevisionComparison } from "@/server/guides/queries";
import { decideReview, publishGuide, submitForReview } from "@/server/guides/review";
import { createGuide, restoreGuide, saveGuide } from "@/server/guides/workflow";
import { getPublishedGuide } from "@/server/public-content";
import { guideContent } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
let owner: Actor;
const db = () => t.db;

const centred = { objectFit: "contain", objectPosition: "center" } as const;

beforeAll(async () => {
  t = await createTestDb();
  const user = await insertUser(t.db, "owner");
  owner = { id: user.id, role: user.role, name: user.name, email: user.email };
});

afterAll(async () => {
  await t.close();
});

async function target(guideId: string) {
  const [guide] = await db().select().from(guides).where(eq(guides.id, guideId));
  return {
    guideId,
    version: guide!.version,
    revisionId: guide!.currentRevisionId!,
    contentHash: guide!.contentHash,
  };
}

async function approveAndPublish(guideId: string) {
  await submitForReview(db(), owner, await target(guideId));
  await decideReview(db(), owner, { ...(await target(guideId)), decision: "approved", notes: "" });
  await publishGuide(db(), owner, await target(guideId));
}

describe("featured image framing", () => {
  it("stores the settings with the article and publishes them", async () => {
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug: "banner-style-publish", featuredImageStyle: centred }),
    );
    const [revision] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    expect(revision?.featuredImageStyle).toEqual(centred);
    expect((await getEditableGuide(db(), owner, created.id))?.content.featuredImageStyle).toEqual(centred);
    expect((await getDraftPreview(db(), owner, created.id))?.featuredImageStyle).toEqual(centred);

    await approveAndPublish(created.id);
    expect((await getPublishedGuide(db(), "banner-style-publish"))?.featuredImageStyle).toEqual(centred);
  });

  it("treats a change as an edit that needs review, and restores earlier settings", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "banner-style-edit" }));
    await approveAndPublish(created.id);
    const [original] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));

    const saved = await saveGuide(
      db(),
      owner,
      created.id,
      (await target(created.id)).version,
      guideContent({ slug: "banner-style-edit", featuredImageStyle: centred }),
    );
    expect(saved.changed).toBe(true);
    const [row] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(row?.reviewState).toBe("not_requested");
    expect((await getPublishedGuide(db(), "banner-style-edit"))?.featuredImageStyle).toEqual(
      FEATURED_IMAGE_DEFAULTS,
    );

    const comparison = await getRevisionComparison(db(), owner, created.id, original!.id);
    expect(comparison?.working.featuredImageStyle).toEqual(centred);
    expect(comparison?.revision.content.featuredImageStyle).toEqual(FEATURED_IMAGE_DEFAULTS);

    await restoreGuide(db(), owner, created.id, original!.id, saved.version);
    expect((await getEditableGuide(db(), owner, created.id))?.content.featuredImageStyle).toEqual(
      FEATURED_IMAGE_DEFAULTS,
    );
  });

  it("reads rows saved before the setting existed as the defaults", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "banner-style-legacy" }));
    await db().execute(sql`update guides set featured_image_style = '{}'::jsonb where id = ${created.id}`);
    await db().execute(
      sql`update guide_revisions set featured_image_style = '{}'::jsonb where guide_id = ${created.id}`,
    );
    expect((await getEditableGuide(db(), owner, created.id))?.content.featuredImageStyle).toEqual(
      FEATURED_IMAGE_DEFAULTS,
    );
    const saved = await saveGuide(db(), owner, created.id, 1, guideContent({ slug: "banner-style-legacy" }));
    expect(saved.changed).toBe(false);
    await expect(
      db().execute(sql`update guides set featured_image_style = '[]'::jsonb where id = ${created.id}`),
    ).rejects.toSatisfy((error: unknown) =>
      `${String(error)} ${String((error as { cause?: unknown }).cause ?? "")}`.includes(
        "guides_featured_image_style_object",
      ),
    );
  });
});
