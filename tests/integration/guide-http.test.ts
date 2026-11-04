import { eq } from "drizzle-orm";
import type * as React from "react";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guideRevisions, guides, guideTopics, topics } from "@/db/schema";
import type { Db } from "@/db/types";
import { MEDIA_MAX_REQUEST_BYTES } from "@/lib/media/inspect-image";
import { createSession } from "@/server/auth/sessions";
import { guideContent } from "../support/fixtures";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

const request = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  db: null as Db | null,
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
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/db", () => ({ getDb: () => request.db }));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  cache: <T>(fn: T) => fn,
}));

const { createGuideAction, saveGuideAction } = await import("@/app/admin/(panel)/guides/actions");
const { createGuide } = await import("@/server/guides/workflow");
const { POST } = await import("@/app/admin/media/upload/route");
const { SESSION_COOKIE } = await import("@/server/auth/request");

let t: TestDb;
let csrf = "";
let token = "";

beforeAll(async () => {
  t = await createTestDb();
  request.db = t.db;
  const editor = await insertUser(t.db, "editor");
  const session = await createSession(t.db, editor.id, null);
  token = session.token;
  const { validateSession } = await import("@/server/auth/sessions");
  csrf = (await validateSession(t.db, token))!.csrfToken;
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  request.headers.clear();
  request.cookies.clear();
  request.headers.set("host", "localhost:3100");
  request.headers.set("origin", "http://localhost:3100");
  request.cookies.set(SESSION_COOKIE, token);
});

async function uploadRequest(form: FormData): Promise<Request> {
  const draft = new Request("http://localhost/draft", { method: "POST", body: form });
  const bytes = await draft.arrayBuffer();
  return new Request("http://localhost:3100/admin/media/upload", {
    method: "POST",
    headers: {
      "content-type": draft.headers.get("content-type") ?? "",
      "content-length": String(bytes.byteLength),
    },
    body: bytes,
  });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("csrf", fields.csrf ?? csrf);
  return data;
}

describe("guide actions", () => {
  it("rejects a cross-origin create and does not report success", async () => {
    request.headers.set("origin", "https://evil.example");
    const result = await createGuideAction(null, form({ title: "CSRF guide title", slug: "csrf-guide" }));
    expect(result?.ok).toBe(false);
    expect(result?.message).toMatch(/origin/i);
    expect(await t.db.select().from(guides).where(eq(guides.slug, "csrf-guide"))).toHaveLength(0);
  });

  it("returns the submitted draft when a save conflicts", async () => {
    const { createGuide, saveGuide } = await import("@/server/guides/workflow");
    const { validateSession } = await import("@/server/auth/sessions");
    const session = await validateSession(t.db, token);
    const created = await createGuide(
      t.db,
      session!.user,
      guideContent({ slug: "action-conflict", title: "Action original title" }),
    );
    await saveGuide(
      t.db,
      session!.user,
      created.id,
      1,
      guideContent({ slug: "action-conflict", title: "Action newer title" }),
    );
    const stale = guideContent({ slug: "action-conflict", title: "Action stale title" });
    const result = await saveGuideAction(
      null,
      form({
        guideId: created.id,
        version: "1",
        title: stale.title,
        slug: stale.slug,
        excerpt: stale.excerpt,
        body: stale.body,
        category: stale.category ?? "",
        products: "[]",
        featuredImageId: "",
        featuredImageAlt: "",
        seoTitle: "",
        seoDescription: "",
      }),
    );
    expect(result?.ok).toBe(false);
    expect(result?.conflict).toBe(true);
    expect(result?.draft?.title).toBe("Action stale title");
    const [guide] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.title).toBe("Action newer title");
  });

  it("saves the FAQ list and rejects one that cannot be read or is incomplete", async () => {
    const { validateSession } = await import("@/server/auth/sessions");
    const session = await validateSession(t.db, token);
    const created = await createGuide(t.db, session!.user, guideContent({ slug: "action-faqs" }));
    const content = guideContent({ slug: "action-faqs" });
    const save = (version: number, faqs: string) =>
      saveGuideAction(
        null,
        form({
          guideId: created.id,
          version: String(version),
          title: content.title,
          slug: content.slug,
          excerpt: content.excerpt,
          body: content.body,
          category: content.category ?? "",
          products: "[]",
          faqs,
        }),
      );

    const saved = await save(1, JSON.stringify([{ question: "Can I rent?", answer: "Yes." }]));
    expect(saved).toMatchObject({ ok: true, message: expect.stringMatching(/Draft saved/) });
    expect(saved?.draft?.faqs).toEqual([{ question: "Can I rent?", answer: "Yes." }]);

    const unreadable = await save(2, "{not json");
    expect(unreadable).toMatchObject({ ok: false, fieldErrors: { faqs: "The FAQ list could not be read." } });

    const incomplete = await save(2, JSON.stringify([{ question: "Can I rent?", answer: "" }]));
    expect(incomplete).toMatchObject({ ok: false, fieldErrors: { faqs: "Each FAQ needs an answer." } });

    const [guide] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(guide?.faqs).toEqual([{ question: "Can I rent?", answer: "Yes." }]);
  });
});

describe("topic selection across repeated saves", () => {
  async function editor() {
    const { validateSession } = await import("@/server/auth/sessions");
    return (await validateSession(t.db, token))!.user;
  }

  function editorForm(guideId: string, version: number, slug: string, topicIds: string[]): FormData {
    const content = guideContent({ slug });
    const data = form({
      guideId,
      version: String(version),
      title: content.title,
      slug: content.slug,
      excerpt: content.excerpt,
      body: content.body,
      category: content.category ?? "",
      products: "[]",
      featuredImageId: "",
      featuredImageAlt: "",
      seoTitle: "",
      seoDescription: "",
    });
    for (const id of topicIds) data.append("topicIds", id);
    return data;
  }

  async function topicIds(): Promise<string[]> {
    return (await t.db.select({ id: topics.id }).from(topics).orderBy(topics.slug).limit(2)).map(
      (row) => row.id,
    );
  }

  async function revisionCount(guideId: string): Promise<number> {
    return (await t.db.select().from(guideRevisions).where(eq(guideRevisions.guideId, guideId))).length;
  }

  it("saves added and removed topics, and an identical second save changes nothing", async () => {
    const [first, second] = await topicIds();
    const created = await createGuide(t.db, await editor(), guideContent({ slug: "topic-resave" }));

    const added = await saveGuideAction(null, editorForm(created.id, 1, "topic-resave", [first!, second!]));
    expect(added).toMatchObject({ ok: true, message: expect.stringMatching(/Draft saved/) });
    expect([...(added?.draft?.topicIds ?? [])].sort()).toEqual([first, second].sort());
    const afterAdd = await revisionCount(created.id);

    const again = await saveGuideAction(
      null,
      editorForm(created.id, added!.version!, "topic-resave", [first!, second!]),
    );
    expect(again).toMatchObject({ ok: true, message: "No changes to save." });
    expect(await revisionCount(created.id)).toBe(afterAdd);

    const removed = await saveGuideAction(
      null,
      editorForm(created.id, again!.version!, "topic-resave", [second!]),
    );
    expect(removed).toMatchObject({ ok: true, message: expect.stringMatching(/Draft saved/) });
    expect(removed?.draft?.topicIds).toEqual([second]);
    const afterRemove = await revisionCount(created.id);

    const againRemoved = await saveGuideAction(
      null,
      editorForm(created.id, removed!.version!, "topic-resave", [second!]),
    );
    expect(againRemoved).toMatchObject({ ok: true, message: "No changes to save." });
    expect(await revisionCount(created.id)).toBe(afterRemove);
    const stored = await t.db
      .select({ topicId: guideTopics.topicId })
      .from(guideTopics)
      .where(eq(guideTopics.guideId, created.id));
    expect(stored.map((row) => row.topicId)).toEqual([second]);
  });

  it("keeps an approval when the same topics are saved again without edits", async () => {
    const [first] = await topicIds();
    const author = await editor();
    const created = await createGuide(
      t.db,
      author,
      guideContent({ slug: "topic-approval", topicIds: [first!] }),
    );
    const ownerUser = await insertUser(t.db, "owner");
    const owner = { id: ownerUser.id, role: ownerUser.role, name: ownerUser.name, email: ownerUser.email };
    const { decideReview, submitForReview } = await import("@/server/guides/review");
    const target = async () => {
      const [row] = await t.db.select().from(guides).where(eq(guides.id, created.id));
      return {
        guideId: created.id,
        version: row!.version,
        revisionId: row!.currentRevisionId!,
        contentHash: row!.contentHash,
      };
    };
    await submitForReview(t.db, author, await target());
    await decideReview(t.db, owner, { ...(await target()), decision: "approved", notes: "" });
    const { version } = await target();

    const resaved = await saveGuideAction(null, editorForm(created.id, version, "topic-approval", [first!]));
    expect(resaved).toMatchObject({ ok: true, message: "No changes to save." });
    const [stored] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(stored?.reviewState).toBe("approved");

    const dropped = await saveGuideAction(null, editorForm(created.id, version, "topic-approval", []));
    expect(dropped?.ok).toBe(true);
    const [invalidated] = await t.db.select().from(guides).where(eq(guides.id, created.id));
    expect(invalidated?.reviewState).toBe("not_requested");
  });
});

describe("media upload route", () => {
  it("rejects an oversized declared length before accepting the file", async () => {
    const response = await POST(
      new Request("http://localhost:3100/admin/media/upload", {
        method: "POST",
        headers: {
          host: "localhost:3100",
          origin: "http://localhost:3100",
          "content-type": "multipart/form-data; boundary=bound",
          "content-length": String(MEDIA_MAX_REQUEST_BYTES + 1),
        },
      }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("rejects a missing session and a spoofed image type", async () => {
    request.cookies.clear();
    const denied = await POST(
      new Request("http://localhost:3100/admin/media/upload", {
        method: "POST",
        headers: {
          host: "localhost:3100",
          origin: "http://localhost:3100",
          "content-length": "32",
        },
      }),
    );
    expect(denied.status).toBe(401);

    request.cookies.set(SESSION_COOKIE, token);
    const png = await sharp({
      create: { width: 3, height: 3, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const data = new FormData();
    data.set("csrf", csrf);
    data.set("altText", "Route test image");
    data.set("file", new File([new Uint8Array(png)], "spoof.jpg", { type: "image/jpeg" }));
    const spoofed = await POST(await uploadRequest(data));
    expect(spoofed.status).toBe(400);
    expect(((await spoofed.json()) as { ok: boolean }).ok).toBe(false);

    const okData = new FormData();
    okData.set("csrf", csrf);
    okData.set("altText", "Route test image");
    okData.set("file", new File([new Uint8Array(png)], "ok.png", { type: "image/png" }));
    const accepted = await POST(await uploadRequest(okData));
    expect(accepted.status).toBe(200);
    const payload = (await accepted.json()) as { ok: boolean; asset?: { id: string } };
    expect(payload.ok).toBe(true);
    expect(payload.asset?.id).toBeTruthy();
  });
});
