import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guideRevisions, guides } from "@/db/schema";
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

const first = [
  { question: "Does it need drilling?", answer: "No." },
  { question: "Is it renter-friendly?", answer: "Yes.\n\nCheck your agreement first." },
];

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

describe("article FAQs", () => {
  it("stores FAQs on the article and its revision, and publishes them", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "faq-publish", faqs: first }));
    const [revision] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    expect(revision?.faqs).toEqual(first);
    expect((await getEditableGuide(db(), owner, created.id))?.content.faqs).toEqual(first);
    expect((await getDraftPreview(db(), owner, created.id))?.faqs).toEqual(first);

    await approveAndPublish(created.id);
    expect((await getPublishedGuide(db(), "faq-publish"))?.faqs).toEqual(first);
  });

  it("keeps the live FAQs until an edited FAQ is approved and published again", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "faq-edit", faqs: first }));
    await approveAndPublish(created.id);

    const edited = [first[1]!, { question: "Does it hold heavy pans?", answer: "Up to 5 kg." }];
    const saved = await saveGuide(db(), owner, created.id, (await target(created.id)).version, {
      ...guideContent({ slug: "faq-edit" }),
      faqs: edited,
    });
    expect(saved.changed).toBe(true);
    const [row] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(row?.faqs).toEqual(edited);
    expect(row?.reviewState).toBe("not_requested");
    expect((await getPublishedGuide(db(), "faq-edit"))?.faqs).toEqual(first);

    await approveAndPublish(created.id);
    expect((await getPublishedGuide(db(), "faq-edit"))?.faqs).toEqual(edited);
  });

  it("shows FAQ changes in a revision comparison and restores them", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "faq-restore", faqs: first }));
    const [original] = await db().select().from(guideRevisions).where(eq(guideRevisions.guideId, created.id));
    await saveGuide(db(), owner, created.id, 1, guideContent({ slug: "faq-restore", faqs: [] }));

    const comparison = await getRevisionComparison(db(), owner, created.id, original!.id);
    expect(comparison?.working.faqs).toEqual([]);
    expect(comparison?.revision.content.faqs).toEqual(first);

    await restoreGuide(db(), owner, created.id, original!.id, 2);
    expect((await getEditableGuide(db(), owner, created.id))?.content.faqs).toEqual(first);
  });

  it("does not create a revision when an article without FAQs is saved unchanged", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "faq-no-change" }));
    const saved = await saveGuide(db(), owner, created.id, 1, guideContent({ slug: "faq-no-change" }));
    expect(saved.changed).toBe(false);
  });

  it("defaults existing rows to no FAQs and only accepts a JSON array", async () => {
    const created = await createGuide(db(), owner, guideContent({ slug: "faq-default" }));
    const [row] = await db().select().from(guides).where(eq(guides.id, created.id));
    expect(row?.faqs).toEqual([]);
    await expect(
      db().execute(sql`update guides set faqs = '{"question":"x"}'::jsonb where id = ${created.id}`),
    ).rejects.toSatisfy((error: unknown) =>
      `${String(error)} ${String((error as { cause?: unknown }).cause ?? "")}`.includes("guides_faqs_array"),
    );
  });
});
