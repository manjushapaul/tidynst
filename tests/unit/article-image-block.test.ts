import { describe, expect, it } from "vitest";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { createArticleImageBlockExtension } from "@/components/admin/article-image-block";
import { publishIssues, bodyMediaIds } from "@/lib/content/publish-rules";
import { guideContent } from "../support/fixtures";

function manager() {
  return new MarkdownManager({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link,
      Image.configure({ inline: true }),
      createArticleImageBlockExtension(),
    ],
  });
}

describe("article image blocks", () => {
  it("round-trips multiple layouts separated by normal article text", () => {
    const data = [
      {
        layout: "side-by-side",
        side: "left",
        text: "",
        images: [
          { src: "/media/11111111-2222-4333-8444-555555555555/a.png", alt: "First image", caption: "First" },
          {
            src: "/media/66666666-2222-4333-8444-555555555555/b.png",
            alt: "Second image",
            caption: "Second",
          },
        ],
      },
      {
        layout: "full",
        side: "left",
        text: "",
        images: [
          { src: "/media/77777777-2222-4333-8444-555555555555/c.png", alt: "Wide image", caption: "" },
        ],
      },
    ];
    const body = [
      "## One heading",
      "",
      "Before the photos.",
      "",
      "```tidynest-images",
      encodeURIComponent(JSON.stringify(data[0])),
      "```",
      "",
      "Text between image layouts.",
      "",
      "```tidynest-images",
      encodeURIComponent(JSON.stringify(data[1])),
      "```",
      "",
      "After the photos.",
    ].join("\n");

    const markdown = manager();
    const document = markdown.parse(body);
    const blocks = document.content?.filter((node) => node.type === "articleImageBlock") ?? [];
    expect(blocks).toHaveLength(2);
    expect(blocks.map((node) => node.attrs)).toEqual(data);

    const saved = markdown.serialize(document);
    expect(saved).toContain(encodeURIComponent(JSON.stringify(data[0])));
    expect(saved).toContain("Text between image layouts.");
    expect(saved).toContain(encodeURIComponent(JSON.stringify(data[1])));
  });

  it("keeps existing Markdown headings, emphasis, links, lists, and inline images readable", () => {
    const legacy = [
      "## Existing section",
      "",
      "**Bold** and _italic_ with [a link](https://example.com).",
      "",
      "- First item",
      "- Second item",
      "",
      '![A labelled shelf](/media/11111111-2222-4333-8444-555555555555/shelf.png "Shelf")',
    ].join("\n");
    const markdown = manager();
    const document = markdown.parse(legacy);
    const saved = markdown.serialize(document);
    expect(saved).toContain("## Existing section");
    expect(saved).toContain("**Bold**");
    expect(saved).toContain("*italic*");
    expect(saved).toContain("https://example.com");
    expect(saved).toContain("- First item");
    expect(saved).toContain("![A labelled shelf]");
  });

  it("includes saved image blocks in media checks and requires alt text before publishing", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const block = {
      layout: "full",
      side: "left",
      text: "",
      images: [{ src: `/media/${id}/shelf.png`, alt: "", caption: "Shelf" }],
    };
    const body = `\`\`\`tidynest-images\n${encodeURIComponent(JSON.stringify(block))}\n\`\`\``;
    expect(bodyMediaIds(body)).toEqual([id]);
    const content = guideContent({ body });
    const issues = publishIssues(content, {
      productStatus: new Map(),
      knownTopicIds: new Set(),
      featuredImageExists: false,
      knownMediaIds: new Set([id]),
    });
    expect(issues.some((issue) => issue.message.includes("alt text"))).toBe(true);
  });
});
