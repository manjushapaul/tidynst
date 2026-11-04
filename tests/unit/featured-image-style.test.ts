import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideDocument, type GuideDocumentModel } from "@/components/content/guide-document";
import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
import { guideContentHash } from "@/lib/content/content-hash";
import { diffGuideContent } from "@/lib/content/diff";
import {
  FEATURED_IMAGE_DEFAULTS,
  featuredImageInlineStyle,
  resolveFeaturedImageStyle,
} from "@/lib/content/featured-image-style";
import { guideContentSchema } from "@/lib/content/guide-schema";
import { guideContent, publishableBody } from "../support/fixtures";

describe("featured image framing", () => {
  it("defaults to filling the frame from the top and rejects values outside the lists", () => {
    expect(FEATURED_IMAGE_DEFAULTS).toEqual({ objectFit: "cover", objectPosition: "top" });
    const { featuredImageStyle: _omitted, ...without } = guideContent();
    expect(guideContentSchema.parse(without).featuredImageStyle).toEqual(FEATURED_IMAGE_DEFAULTS);
    expect(
      guideContentSchema.parse({ ...without, featuredImageStyle: { objectPosition: "center" } })
        .featuredImageStyle,
    ).toEqual({ objectFit: "cover", objectPosition: "center" });
    expect(
      guideContentSchema.safeParse({ ...without, featuredImageStyle: { objectPosition: "10% 20%" } }).success,
    ).toBe(false);
    expect(guideContentSchema.safeParse({ ...without, featuredImageStyle: { extra: 1 } }).success).toBe(
      false,
    );
  });

  it("reads stored settings from before this existed as the defaults", () => {
    expect(resolveFeaturedImageStyle({})).toEqual(FEATURED_IMAGE_DEFAULTS);
    expect(resolveFeaturedImageStyle(null)).toEqual(FEATURED_IMAGE_DEFAULTS);
    expect(resolveFeaturedImageStyle({ objectFit: "stretch" })).toEqual(FEATURED_IMAGE_DEFAULTS);
  });

  it("keeps the hash of articles on the defaults and changes it otherwise", () => {
    const base = guideContent();
    const { featuredImageStyle: _omitted, ...legacy } = base;
    expect(guideContentHash(base)).toBe(
      guideContentHash({ ...legacy, featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS } }),
    );
    const centred = guideContent({ featuredImageStyle: { objectFit: "cover", objectPosition: "center" } });
    expect(guideContentHash(centred)).not.toBe(guideContentHash(base));
    expect(diffGuideContent(base, centred).map((diff) => diff.label)).toEqual(["Featured image framing"]);
  });

  it("draws the banner with the chosen fit and position", () => {
    expect(featuredImageInlineStyle({ objectFit: "contain", objectPosition: "bottom" })).toEqual({
      objectFit: "contain",
      objectPosition: "bottom",
    });
    const model = (featuredImageStyle: GuideDocumentModel["featuredImageStyle"]): GuideDocumentModel => ({
      slug: "banner-style-demo",
      title: "Banner style demo",
      excerpt: "A short summary for the banner style demo article used in tests.",
      body: publishableBody(),
      closing: "",
      category: "kitchen",
      seoTitle: null,
      seoDescription: null,
      readingMinutes: 3,
      updatedAt: new Date("2026-10-13T00:00:00.000Z"),
      firstPublishedAt: new Date("2026-10-01T00:00:00.000Z"),
      image: {
        src: "/media/00000000-0000-4000-8000-000000000001/banner.png",
        width: 2100,
        height: 900,
        alt: "Banner",
      },
      topics: [],
      products: [],
      faqs: [],
      articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
      featuredImageStyle,
    });
    const render = (style: GuideDocumentModel["featuredImageStyle"]) =>
      renderToStaticMarkup(
        createElement(GuideDocument, { guide: model(style), structuredData: false, optimizeImages: false }),
      );
    const defaults = render({ ...FEATURED_IMAGE_DEFAULTS });
    expect(defaults).toContain("object-fit:cover");
    expect(defaults).toContain("object-position:top");
    const changed = render({ objectFit: "contain", objectPosition: "center" });
    expect(changed).toContain("object-fit:contain");
    expect(changed).toContain("object-position:center");
  });
});
