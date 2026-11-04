import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideDocument } from "@/components/content/guide-document";
import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import { guideContentHash } from "@/lib/content/content-hash";
import { guideContentSchema } from "@/lib/content/guide-schema";
import { guideContent, publishableBody } from "../support/fixtures";

describe("guide closing field", () => {
  it("defaults to empty and changes the content hash when set", () => {
    const empty = guideContentSchema.parse({ ...guideContent(), closing: undefined });
    expect(empty.closing).toBe("");
    const withClosing = guideContent({
      closing: "## Final Thoughts\n\nStart with one idea this week.",
    });
    expect(guideContentHash(withClosing)).not.toBe(guideContentHash(guideContent()));
  });

  it("renders after the body and outside article image rows", () => {
    const html = renderToStaticMarkup(
      createElement(GuideDocument, {
        guide: {
          slug: "closing-demo",
          title: "Closing demo",
          excerpt: "A short summary for the closing demo article used in tests.",
          body: `${publishableBody()}\n\n![Shelf](/media/00000000-0000-4000-8000-000000000001/shelf.png)`,
          closing: "## Final Thoughts\n\nChoose one idea to try this week.",
          category: "kitchen",
          seoTitle: null,
          seoDescription: null,
          readingMinutes: 3,
          updatedAt: new Date("2026-10-13T00:00:00.000Z"),
          firstPublishedAt: new Date("2026-10-01T00:00:00.000Z"),
          image: null,
          topics: [],
          products: [],
          faqs: [],
          articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
          featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
        },
      }),
    );
    expect(html).toContain("Final Thoughts");
    expect(html).toContain("Choose one idea to try this week.");
    expect(html).toContain('href="#final-thoughts"');
    const bodyIdx = html.indexOf("Start with what you use daily");
    const closingIdx = html.indexOf("Final Thoughts");
    expect(closingIdx).toBeGreaterThan(bodyIdx);
  });
});
