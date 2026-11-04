import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@/components/content/markdown-content";
import {
  ARTICLE_IMAGE_DEFAULTS,
  resolveImageStyle,
  splitImageSrc,
  summariseArticleImageStyle,
  withImageStyle,
} from "@/lib/content/article-image-style";
import { removeMediaFromBody, setImageSrcAt } from "@/lib/content/body-images";
import { bodyMediaIds, publishIssues } from "@/lib/content/publish-rules";
import { guideContent } from "../support/fixtures";

const ID = "00000000-0000-4000-8000-000000000001";
const SRC = `/media/${ID}/shelf.png`;

describe("settings for one section image", () => {
  it("writes only the settings that differ from the defaults, and reads them back", () => {
    expect(withImageStyle(SRC, { ...ARTICLE_IMAGE_DEFAULTS })).toBe(SRC);
    const square = {
      ...ARTICLE_IMAGE_DEFAULTS,
      aspectRatio: "1:1",
      objectFit: "contain",
      width: "75%",
    } as const;
    const src = withImageStyle(SRC, square);
    expect(src).toBe(`${SRC}#shape=1:1&fit=contain&width=75`);
    expect(splitImageSrc(src)).toEqual({
      path: SRC,
      style: { aspectRatio: "1:1", objectFit: "contain", width: "75%" },
    });
    expect(withImageStyle(src, { ...ARTICLE_IMAGE_DEFAULTS })).toBe(SRC);
    expect(summariseArticleImageStyle(square)).toBe(
      "Square (1:1) · Show the whole image · Three quarters (75%)",
    );
  });

  it("ignores values that are not in the lists", () => {
    expect(splitImageSrc(`${SRC}#shape=calc(1px)&width=999`)).toEqual({ path: SRC, style: null });
    expect(splitImageSrc(SRC)).toEqual({ path: SRC, style: null });
  });

  it("overrides the article's settings, even when choosing the defaults", () => {
    const article = { ...ARTICLE_IMAGE_DEFAULTS, objectFit: "contain" } as const;
    expect(withImageStyle(SRC, article, article)).toBe(SRC);
    const src = withImageStyle(SRC, { ...ARTICLE_IMAGE_DEFAULTS }, article);
    expect(src).toBe(`${SRC}#shape=3:4`);
    expect(resolveImageStyle(splitImageSrc(src).style, article)).toEqual(ARTICLE_IMAGE_DEFAULTS);
    expect(resolveImageStyle(null, article)).toEqual(article);
  });

  it("changes only the chosen image's address in the body", () => {
    const body = `## One\n\n![Shelf](${SRC} "On the wall")\n\n## Two\n\n![Shelf](${SRC})`;
    const start = body.indexOf("![");
    const end = body.indexOf(")", start) + 1;
    const next = setImageSrcAt(body, start, end, `${SRC}#fit=contain`);
    expect(next).toBe(`## One\n\n![Shelf](${SRC}#fit=contain "On the wall")\n\n## Two\n\n![Shelf](${SRC})`);
    expect(setImageSrcAt(body, 0, 6, "/x")).toBe(body);
  });

  it("still counts as a library image for the publish checks and media clean-up", () => {
    const body = `## One\n\n![Shelf](${SRC}#shape=1:1)\n\nText.`;
    expect(bodyMediaIds(body)).toEqual([ID]);
    expect(removeMediaFromBody(body, ID)).toBe("## One\n\nText.");
    const issues = publishIssues(guideContent({ body }), {
      productStatus: new Map(),
      knownTopicIds: new Set(),
      featuredImageExists: false,
      knownMediaIds: new Set([ID]),
    });
    expect(issues.filter((issue) => issue.field === "body")).toEqual([]);
  });

  it("draws each image with its own settings on the article page", () => {
    const markdown = `## One\n\n![Shelf](${SRC}#shape=1:1&corners=none)\n\nText.\n\n## Two\n\n![Plain](${SRC})\n\nMore.`;
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { markdown, className: "prose-article", layout: "article" }),
    );
    expect(html).toContain(`src="${SRC}"`);
    expect(html).not.toContain("#shape");
    expect(html).toContain("--article-img-ratio:1 / 1");
    expect(html).toContain("--article-img-radius:0");
    expect(html.match(/--article-img-ratio/g)).toHaveLength(1);
  });

  it("shows Edit beside Remove on each image in the editor preview", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        markdown: `![Shelf](${SRC})`,
        onRemoveImage: () => {},
        onEditImage: () => {},
      }),
    );
    expect(html).toContain(">Edit</button>");
    expect(html).toContain(">Remove</button>");
    expect(html.indexOf(">Edit<")).toBeLessThan(html.indexOf(">Remove<"));
  });
});
