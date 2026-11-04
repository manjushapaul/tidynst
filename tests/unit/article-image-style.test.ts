import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideDocument, type GuideDocumentModel } from "@/components/content/guide-document";
import {
  ARTICLE_IMAGE_DEFAULTS,
  articleImageCssVars,
  resolveArticleImageStyle,
} from "@/lib/content/article-image-style";
import { guideContentHash } from "@/lib/content/content-hash";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import { diffGuideContent } from "@/lib/content/diff";
import { guideContentSchema } from "@/lib/content/guide-schema";
import { guideContent, publishableBody } from "../support/fixtures";

describe("section image settings", () => {
  it("defaults every setting and rejects values outside the lists", () => {
    const { articleImageStyle: _omitted, ...without } = guideContent();
    expect(guideContentSchema.parse(without).articleImageStyle).toEqual(ARTICLE_IMAGE_DEFAULTS);
    expect(
      guideContentSchema.parse({ ...without, articleImageStyle: { objectFit: "contain" } }).articleImageStyle,
    ).toEqual({ ...ARTICLE_IMAGE_DEFAULTS, objectFit: "contain" });
    const bad = guideContentSchema.safeParse({ ...without, articleImageStyle: { width: "calc(1px)" } });
    expect(bad.success).toBe(false);
    expect(guideContentSchema.safeParse({ ...without, articleImageStyle: { extra: 1 } }).success).toBe(false);
  });

  it("reads stored settings from before this existed as the defaults", () => {
    expect(resolveArticleImageStyle({})).toEqual(ARTICLE_IMAGE_DEFAULTS);
    expect(resolveArticleImageStyle(null)).toEqual(ARTICLE_IMAGE_DEFAULTS);
    expect(resolveArticleImageStyle({ aspectRatio: "nonsense" })).toEqual(ARTICLE_IMAGE_DEFAULTS);
  });

  it("keeps the hash of articles on the defaults and changes it otherwise", () => {
    const base = guideContent();
    const { articleImageStyle: _omitted, ...legacy } = base;
    expect(guideContentHash(base)).toBe(
      guideContentHash({ ...legacy, articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS } }),
    );
    const square = guideContent({ articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS, aspectRatio: "1:1" } });
    expect(guideContentHash(square)).not.toBe(guideContentHash(base));
    expect(diffGuideContent(base, square).map((diff) => diff.label)).toEqual(["Section images"]);
  });

  it("sets CSS variables only when something changed", () => {
    expect(articleImageCssVars({ ...ARTICLE_IMAGE_DEFAULTS })).toBeUndefined();
    expect(
      articleImageCssVars({
        aspectRatio: "16:9",
        objectFit: "contain",
        borderRadius: "none",
        width: "75%",
        height: "24rem",
      }),
    ).toEqual({
      "--article-img-ratio": "16 / 9",
      "--article-img-fit": "contain",
      "--article-img-radius": "0",
      "--article-img-width": "75%",
      "--article-img-height": "24rem",
    });
  });

  it("applies the settings to the article body on the page", () => {
    const model = (articleImageStyle: GuideDocumentModel["articleImageStyle"]): GuideDocumentModel => ({
      slug: "image-style-demo",
      title: "Image style demo",
      excerpt: "A short summary for the image style demo article used in tests.",
      body: `${publishableBody()}\n\n![Shelf](/media/00000000-0000-4000-8000-000000000001/shelf.png)`,
      closing: "",
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
      articleImageStyle,
      featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
    });
    const render = (style: GuideDocumentModel["articleImageStyle"]) =>
      renderToStaticMarkup(createElement(GuideDocument, { guide: model(style), structuredData: false }));
    expect(render({ ...ARTICLE_IMAGE_DEFAULTS })).not.toContain("--article-img");
    const html = render({ ...ARTICLE_IMAGE_DEFAULTS, objectFit: "contain" });
    expect(html).toContain("--article-img-fit:contain");
    expect(html).toContain("--article-img-ratio:3 / 4");
  });
});
