import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/auth/permissions";
import type { EditableGuide } from "@/server/guides/queries";
import { guideContent } from "../support/fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/app/admin/(panel)/guides/review-actions", () => ({
  approveReviewAction: async () => null,
  publishGuideAction: async () => null,
  submitForReviewAction: async () => null,
  unpublishGuideAction: async () => null,
}));
vi.mock("@/app/admin/(panel)/media/actions", () => ({ deleteMediaAction: async () => null }));

const { GuideEditor } = await import("@/components/admin/guide-editor");
const { ArticleWorkflowPanel } = await import("@/components/admin/article-workflow-panel");
const { nextAnnouncement } = await import("@/components/admin/workflow-status");
const { DeleteImageButton } = await import("@/components/admin/delete-image-button");

const TOPICS = [
  { id: "a3d32a4f-8970-4690-a6cf-c6c70ac27cfb", name: "Budget" },
  { id: "42ac8ff7-d274-429e-a71c-49ffbd1cea8a", name: "No-drill" },
  { id: "da2a6d04-02ca-41e2-9c79-2af9ea4defda", name: "Space-saving" },
];

function inputs(markup: string): string[] {
  return markup.match(/<input[^>]*>/g) ?? [];
}

describe("article editor topics", () => {
  it("keeps an article's existing topics without showing a topic checklist", () => {
    const markup = renderToStaticMarkup(
      createElement(GuideEditor, {
        csrf: "token",
        action: async () => null,
        mode: "edit",
        guideId: "11111111-2222-4333-8444-555555555555",
        initial: guideContent({ topicIds: [TOPICS[1]!.id, TOPICS[2]!.id] }),
        version: 3,
        everPublished: false,
        topics: TOPICS,
        products: [],
        media: [],
        canDeleteMedia: false,
      }),
    );
    const fields = inputs(markup);
    const submitted = fields.filter((field) => field.includes('name="topicIds"'));
    expect(submitted).toHaveLength(2);
    expect(submitted.every((field) => field.includes('type="hidden"'))).toBe(true);
    expect(submitted.map((field) => /value="([^"]+)"/.exec(field)?.[1])).toEqual([
      TOPICS[1]!.id,
      TOPICS[2]!.id,
    ]);

    expect(fields.filter((field) => field.includes('type="checkbox"'))).toHaveLength(0);
    expect(markup).not.toContain(">Topics</legend>");
    expect(markup).not.toContain("Add a topic");
  });
});

describe("article image size guidance", () => {
  it("shows the recommended size under Add images and links it to the button", () => {
    const markup = renderToStaticMarkup(
      createElement(GuideEditor, {
        csrf: "token",
        action: async () => null,
        mode: "create",
        initial: guideContent(),
        version: 1,
        everPublished: false,
        topics: [],
        products: [],
        media: [],
        canDeleteMedia: false,
      }),
    );
    const button =
      /<button[^>]*aria-describedby="([^"]+)"[^>]*>Add images<\/button><p id="([^"]+)"[^>]*>([^<]+)<\/p>/.exec(
        markup,
      );
    expect(button?.[1]).toBe(button?.[2]);
    expect(button?.[3]).toBe("Recommended size: 350 × 400 px (portrait).");
    const featured =
      /<button[^>]*aria-describedby="([^"]+)"[^>]*>Choose featured image<\/button><p id="([^"]+)"[^>]*>([^<]+)<\/p>/.exec(
        markup,
      );
    expect(featured?.[1]).toBe(featured?.[2]);
    expect(featured?.[3]).toBe("Recommended size: 2176 × 934 px (21:9 landscape).");
  });
});

describe("deleting images from the editor dialogs", () => {
  const asset = {
    id: "33333333-2222-4333-8444-555555555555",
    src: "/media/33333333-2222-4333-8444-555555555555/shelf.png",
    altText: "Shelf",
    filename: "shelf.png",
    width: 10,
    height: 10,
  };
  const render = (overrides: { usedHere?: boolean; usedBy?: "published" | "draft" }) =>
    renderToStaticMarkup(
      createElement(DeleteImageButton, {
        csrf: "token",
        asset: { ...asset, usedBy: overrides.usedBy ?? null },
        usedHere: overrides.usedHere ?? false,
        onDeleted: () => undefined,
      }),
    );

  it("offers delete only when the image is unused, and explains when it is blocked", () => {
    expect(render({})).toContain("Delete image");
    expect(render({ usedHere: true })).toContain("In use in this article");
    expect(render({ usedHere: true })).toContain("Delete unavailable");
    expect(render({ usedBy: "published", usedHere: true })).toContain("On a published article");
    expect(render({ usedBy: "published", usedHere: true })).toContain("Delete unavailable");
    expect(render({ usedBy: "draft" })).toContain("In another article&#x27;s draft");
    expect(render({ usedBy: "draft" })).toContain("Delete unavailable");
  });

  it("hides delete from people without permission", () => {
    const markup = renderToStaticMarkup(
      createElement(GuideEditor, {
        csrf: "token",
        action: async () => null,
        mode: "create",
        initial: guideContent(),
        version: 1,
        everPublished: false,
        topics: [],
        products: [],
        media: [asset],
        canDeleteMedia: false,
      }),
    );
    expect(markup).not.toContain("Delete image");
    expect(
      renderToStaticMarkup(
        createElement(GuideEditor, {
          csrf: "token",
          action: async () => null,
          mode: "create",
          initial: guideContent(),
          version: 1,
          everPublished: false,
          topics: [],
          products: [],
          media: [asset],
          canDeleteMedia: true,
        }),
      ),
    ).toContain("Delete image");
  });
});

const owner: Actor = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "owner",
  name: "Owner",
  email: "o@example.test",
};

function guide(overrides: Partial<EditableGuide>): EditableGuide {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    version: 4,
    everPublished: false,
    reviewState: "not_requested",
    publication: "draft",
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    deletable: true,
    content: guideContent(),
    currentRevisionId: "22222222-2222-4333-8444-555555555555",
    currentRevisionNumber: 2,
    contentHash: "a".repeat(64),
    publishedRevisionId: null,
    publishedRevisionNumber: null,
    publishedAt: null,
    approvalCurrent: false,
    latestReview: null,
    ...overrides,
  } as EditableGuide;
}

describe("review and publishing panel", () => {
  it("always renders empty status and alert regions so outcomes are announced", () => {
    const markup = renderToStaticMarkup(
      createElement(ArticleWorkflowPanel, { guide: guide({}), actor: owner, csrf: "token" }),
    );
    expect(markup).toMatch(/<div role="status" aria-live="polite" aria-atomic="true"><\/div>/);
    expect(markup).toMatch(/<div role="alert" aria-atomic="true"><\/div>/);
  });

  it("gives the owner's self-approval an optional note and keeps the exact revision target", () => {
    const markup = renderToStaticMarkup(
      createElement(ArticleWorkflowPanel, {
        guide: guide({ reviewState: "in_review" }),
        actor: owner,
        csrf: "token",
      }),
    );
    const note = /<textarea[^>]*name="notes"[^>]*>/.exec(markup)?.[0];
    expect(note).toBeTruthy();
    expect(note).not.toContain("required");
    expect(markup).toContain("Approval note (optional)");
    expect(markup).toContain(`name="contentHash" value="${"a".repeat(64)}"`);
    expect(markup).toContain('name="revisionId" value="22222222-2222-4333-8444-555555555555"');
  });

  it("keeps the unpublish safeguards: required reason and required confirmation", () => {
    const markup = renderToStaticMarkup(
      createElement(ArticleWorkflowPanel, {
        guide: guide({
          reviewState: "approved",
          approvalCurrent: true,
          publication: "published",
          publishedRevisionId: "22222222-2222-4333-8444-555555555555",
          publishedRevisionNumber: 2,
          publishedAt: new Date("2026-10-02T10:00:00Z"),
        }),
        actor: owner,
        csrf: "token",
      }),
    );
    expect(/<textarea[^>]*name="reason"[^>]*>/.exec(markup)?.[0]).toContain("required");
    expect(inputs(markup).find((field) => field.includes('name="confirm"'))).toContain("required");
  });
});

describe("workflow announcements", () => {
  it("numbers each outcome so a repeated message is announced again, and ignores empty results", () => {
    const first = nextAnnouncement(null, { ok: true, message: "Approved." });
    expect(first).toEqual({ id: 1, ok: true, message: "Approved." });
    const second = nextAnnouncement(first, { ok: true, message: "Approved." });
    expect(second?.id).toBe(2);
    expect(nextAnnouncement(second, { ok: false, message: "This page is out of date." })).toEqual({
      id: 3,
      ok: false,
      message: "This page is out of date.",
    });
    expect(nextAnnouncement(second, null)).toBeNull();
    expect(nextAnnouncement(second, { ok: true, message: null })).toBeNull();
  });
});
