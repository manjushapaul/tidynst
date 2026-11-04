import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guideRevisions, guides } from "@/db/schema";
import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
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

const landscape = {
  ...ARTICLE_IMAGE_DEFAULTS,
  aspectRatio: "4:3",
  objectFit: "contain",
  borderRadius: "none",
} as const;

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

describe("section image settings", () => {
  it("stores the settings with the article and publishes them", async () => {
    const created = await createGuide(
      db(),
      owner,
      guideContent({ slug: "image-style-publish", articleImageStyle: landscape }),
    );
    const [revision] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    expect(revision?.articleImageStyle).toEqual(landscape);
    expect((await getEditableGuide(db(), owner, created.id))?.content.articleImageStyle).toEqual(landscape);
    expect((await getDraftPreview(db(), owner, created.id))?.articleImageStyle).toEqual(landscape);

    await approveAndPublish(created.id);
    expect((await getPublishedGuide(db(), "image-style-publish"))?.articleImageStyle).toEqual(landscape);
  });

  it("treats a change as an edit that needs review, and restores earlier settings", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "image-style-edit" }));
    await approveAndPublish(created.id);
    const [original] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));

    const saved = await saveGuide(
      db(),
      owner,
      created.id,
      (await target(created.id)).version,
      guideContent({ slug: "image-style-edit", articleImageStyle: landscape }),
    );
    expect(saved.changed).toBe(true);
    const [row] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(row?.reviewState).toBe("not_requested");
    expect((await getPublishedGuide(db(), "image-style-edit"))?.articleImageStyle).toEqual(
      ARTICLE_IMAGE_DEFAULTS,
    );

    const comparison = await getRevisionComparison(db(), owner, created.id, original!.id);
    expect(comparison?.working.articleImageStyle).toEqual(landscape);
    expect(comparison?.revision.content.articleImageStyle).toEqual(ARTICLE_IMAGE_DEFAULTS);

    await restoreGuide(db(), owner, created.id, original!.id, saved.version);
    expect((await getEditableGuide(db(), owner, created.id))?.content.articleImageStyle).toEqual(
      ARTICLE_IMAGE_DEFAULTS,
    );
  });

  it("reads rows saved before the setting existed as the defaults", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "image-style-legacy" }));
    await db().execute(sql`update guides set article_image_style = '{}'::jsonb where id = ${created.id}`);
    await db().execute(
      sql`update guide_revisions set article_image_style = '{}'::jsonb where guide_id = ${created.id}`,
    );
    expect((await getEditableGuide(db(), owner, created.id))?.content.articleImageStyle).toEqual(
      ARTICLE_IMAGE_DEFAULTS,
    );
    const saved = await saveGuide(db(), owner, created.id, 1, guideContent({ slug: "image-style-legacy" }));
    expect(saved.changed).toBe(false);
    await expect(
      db().execute(sql`update guides set article_image_style = '[]'::jsonb where id = ${created.id}`),
    ).rejects.toSatisfy((error: unknown) =>
      `${String(error)} ${String((error as { cause?: unknown }).cause ?? "")}`.includes(
        "guides_article_image_style_object",
      ),
    );
  });
});
