import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent, type SourceRange } from "@/components/content/markdown-content";
import {
  imageMarkdown,
  imagesMarkdown,
  insertSnippet,
  mediaFileKey,
  removeImageAt,
  removeMediaFromBody,
} from "@/lib/content/body-images";
import { extractLinks } from "@/lib/content/markdown";
import { bodyMediaIds } from "@/lib/content/publish-rules";

const A = {
  src: "/media/3eff51d5-254e-4ac8-9c59-af505a1cd8e5/shelf.png",
  altText: "Open shelf above the sink",
};
const B = {
  src: "/media/aa75ad34-22c3-4862-a3ae-978eadcb36e9/jars.webp",
  altText: "Labelled jars in a drawer",
};

const render = (markdown: string) => renderToStaticMarkup(createElement(MarkdownContent, { markdown }));

describe("body image markdown", () => {
  it("writes the caption as the image title and keeps it on one line", () => {
    expect(imageMarkdown(A)).toBe(`![Open shelf above the sink](${A.src})`);
    expect(imageMarkdown(A, "  Shelves\n keep  spices close ")).toBe(
      `![Open shelf above the sink](${A.src} "Shelves keep spices close")`,
    );
  });

  it("replaces characters the link checks cannot read, so captioned images are still recognised", () => {
    const markdown = imageMarkdown(
      { src: A.src, altText: "Rack [left] with a \\ backslash" },
      'The "best" rack \\ ever',
    );
    expect(markdown).toBe(`![Rack (left) with a backslash](${A.src} "The 'best' rack ever")`);
    const [link] = extractLinks(markdown);
    expect(link).toMatchObject({ image: true, url: A.src });
    expect(link?.text).toBe("Rack (left) with a backslash");
    expect(bodyMediaIds(imagesMarkdown([{ ...A, caption: 'A "quoted" caption' }, B]))).toEqual([
      "3eff51d5-254e-4ac8-9c59-af505a1cd8e5",
      "aa75ad34-22c3-4862-a3ae-978eadcb36e9",
    ]);
  });

  it("puts each of several images in its own paragraph, in order", () => {
    expect(imagesMarkdown([{ ...A, caption: "First" }, B])).toBe(
      `![Open shelf above the sink](${A.src} "First")\n\n![Labelled jars in a drawer](${B.src})`,
    );
  });
});

describe("removing a deleted image from the body", () => {
  const gone = "11111111-2222-4333-8444-555555555555";
  const kept = "66666666-2222-4333-8444-555555555555";

  it("removes every image of that file, keeps other images and the text of plain links", () => {
    const body = [
      "## Shelf",
      "Before the photo.",
      `![Shelf photo](/media/${gone}/shelf.png "Caption")`,
      `![Other photo](/media/${kept}/other.png)`,
      `See [the full size photo](/media/${gone.toUpperCase()}/shelf.png) for detail.`,
      `![Shelf again](/media/${gone}/shelf.png)`,
      "After the photo.",
    ].join("\n\n");
    expect(removeMediaFromBody(body, gone)).toBe(
      [
        "## Shelf",
        "Before the photo.",
        `![Other photo](/media/${kept}/other.png)`,
        "See the full size photo for detail.",
        "After the photo.",
      ].join("\n\n"),
    );
    expect(bodyMediaIds(removeMediaFromBody(body, gone))).toEqual([kept]);
  });

  it("leaves a body that does not use the image unchanged", () => {
    const body = `Text with a hard break  \nnext line\n\n\n![Other](/media/${kept}/other.png)`;
    expect(removeMediaFromBody(body, gone)).toBe(body);
  });
});

describe("inserting into the body", () => {
  it("separates block snippets from surrounding text with blank lines", () => {
    expect(insertSnippet("", 0, 0, "IMG", true)).toEqual({ value: "IMG", cursor: 3 });
    expect(insertSnippet("Intro text.", 11, 11, "IMG", true)).toEqual({
      value: "Intro text.\n\nIMG",
      cursor: 16,
    });
    const middle = insertSnippet("Before.After.", 7, 7, "IMG", true);
    expect(middle.value).toBe("Before.\n\nIMG\n\nAfter.");
    expect(middle.value.slice(0, middle.cursor)).toBe("Before.\n\nIMG");
    expect(insertSnippet("One.\n\nTwo.", 6, 6, "IMG", true).value).toBe("One.\n\nIMG\n\nTwo.");
    expect(insertSnippet("One.\nTwo.", 5, 5, "IMG", true).value).toBe("One.\n\nIMG\n\nTwo.");
  });

  it("replaces a selection and leaves inline snippets untouched", () => {
    expect(insertSnippet("Hello world", 6, 11, "there")).toEqual({ value: "Hello there", cursor: 11 });
    expect(insertSnippet("Hello world", 6, 11, "IMG", true).value).toBe("Hello \n\nIMG");
  });
});

describe("body image sizes", () => {
  it("keys library files by id and decoded filename", () => {
    expect(mediaFileKey("/media/3eff51d5-254e-4ac8-9c59-af505a1cd8e5/shelf%20photo.png")).toBe(
      "3eff51d5-254e-4ac8-9c59-af505a1cd8e5/shelf photo.png",
    );
    expect(mediaFileKey("/images/shelf.png")).toBeNull();
    expect(mediaFileKey("/media/3eff51d5-254e-4ac8-9c59-af505a1cd8e5/%E0%A4")).toBeNull();
  });

  it("gives images with a known size width and height so they reserve space", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        markdown: `${imageMarkdown(A)}\n\n${imageMarkdown(B)}`,
        imageSizes: { "3eff51d5-254e-4ac8-9c59-af505a1cd8e5/shelf.png": { width: 1600, height: 1200 } },
      }),
    );
    expect(html).toContain(`src="${A.src}" alt="${A.altText}" width="1600" height="1200"`);
    expect(html).not.toMatch(/jars\.webp"[^>]*width=/);
  });
});

describe("rendering body images", () => {
  it("shows a standalone image as a figure with its caption", () => {
    const html = render(`Intro.\n\n${imageMarkdown(A, "Shelves keep spices close")}\n\nAfter.`);
    expect(html).toContain(
      `<figure><img src="${A.src}" alt="Open shelf above the sink" loading="lazy" decoding="async"/><figcaption>Shelves keep spices close</figcaption></figure>`,
    );
    expect(html).not.toContain("<p><img");
  });

  it("renders several images as separate figures, without a caption when none is given", () => {
    const html = render(imagesMarkdown([{ ...A, caption: "First" }, B]));
    expect(html.match(/<figure>/g)).toHaveLength(2);
    expect(html.match(/<figcaption>/g)).toHaveLength(1);
    expect(html).not.toContain("title=");
  });

  it("keeps an image that sits inside a sentence in its paragraph", () => {
    const html = render(`See ${imageMarkdown(A)} here.`);
    expect(html).toContain("<p>See <img");
    expect(html).not.toContain("<figure>");
  });

  it("never turns an image from outside the media library into a figure", () => {
    const html = render('![Remote](https://example.test/a.png "Caption")');
    expect(html).not.toContain("<figure>");
    expect(html).not.toContain("<img");
    expect(html).toContain("Remote");
  });

  it("shows no remove buttons on the public page", () => {
    expect(render(imagesMarkdown([A, B]))).not.toContain("<button");
  });
});

type Node = ReactElement<{ children?: unknown; onClick?: () => void; "aria-label"?: string }>;

/** Renders the editor preview's element tree and returns each Remove button, in order. */
function removeButtons(markdown: string, onRemoveImage: (range: SourceRange) => void): Node[] {
  const found: Node[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!isValidElement(value)) return;
    const element = value as Node;
    if (element.type === "button") found.push(element);
    if (typeof element.type === "function")
      return walk((element.type as (props: unknown) => unknown)(element.props));
    walk(element.props.children);
  };
  walk(MarkdownContent({ markdown, onRemoveImage }));
  return found;
}

describe("article layout: alternating image and text rows", () => {
  const article = [
    "Intro paragraph before any section.",
    "## Organise by daily use",
    imageMarkdown(A, "Daily items within reach"),
    "Keep what you use every day at the front.",
    "- Oil\n- Salt",
    "## A section without an image",
    "Only text here.",
    "## Make better use of vertical space",
    "Shelves above the counter double storage.",
    imageMarkdown(B),
    "## Create a spice area",
    imageMarkdown(A),
    "> **Tip:** Label the lids.",
  ].join("\n\n");
  const html = renderToStaticMarkup(
    createElement(MarkdownContent, { markdown: article, layout: "article" }),
  ).replaceAll("\n", "");

  it("turns only sections with an image into rows, alternating the image side", () => {
    expect(html.match(/class="article-row"/g)).toHaveLength(3);
    expect([...html.matchAll(/data-side="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "image-left",
      "image-right",
      "image-left",
    ]);
    expect(html.startsWith('<div><p>Intro paragraph before any section.</p><div class="article-row"')).toBe(
      true,
    );
    expect(html).toContain('<h2 id="a-section-without-an-image">A section without an image</h2>');
    expect(html.indexOf("Only text here.")).toBeLessThan(html.indexOf("Make better use"));
  });

  it("puts the image first in reading order, then the heading and its text, lists and tips", () => {
    const row =
      /<div class="article-row" data-side="image-right"><div class="article-row-media">(.*?)<\/div><div class="article-row-text">(.*?)<\/div><\/div>/.exec(
        html,
      );
    expect(row?.[1]).toContain(`<figure><img src="${B.src}" alt="Labelled jars in a drawer"`);
    expect(row?.[2]).toMatch(/^<h2 id="make-better-use-of-vertical-space">/);
    expect(row?.[2]).toContain("Shelves above the counter double storage.");
    expect(html).toContain("<figcaption>Daily items within reach</figcaption>");
    expect(html).toContain("<li>Oil</li>");
    expect(html).toContain("<blockquote><p><strong>Tip:</strong> Label the lids.</p></blockquote>");
  });

  it("leaves other pages, revisions and the editor preview in the plain layout", () => {
    expect(render(article)).not.toContain("article-row");
  });

  it("keeps numbered lists announced as lists and continues a list's own numbering", () => {
    expect(render("1. **Measure:** first\n2. **Fit:** second")).toContain('<ol role="list">');
    expect(render("3. Third step\n4. Fourth step")).toContain(
      '<ol role="list" start="3" style="counter-reset:step 2">',
    );
  });

  const rowParts = (markdown: string) => {
    const out = renderToStaticMarkup(
      createElement(MarkdownContent, { markdown, layout: "article" }),
    ).replaceAll("\n", "");
    return [
      ...out.matchAll(
        /<div class="article-row"([^>]*)><div class="article-row-media">(.*?)<\/div><div class="article-row-text">(.*?)<\/div><\/div>/g,
      ),
    ].map((match) => ({ attrs: match[1] ?? "", media: match[2] ?? "", text: match[3] ?? "" }));
  };

  it("uses an image written on the same line as the text, keeping the text beside it", () => {
    const [row] = rowParts(`## Vertical space\n${imageMarkdown(A)} When floor space is limited, look up.`);
    expect(row?.media).toBe(
      `<figure><img src="${A.src}" alt="${A.altText}" loading="lazy" decoding="async"/></figure>`,
    );
    expect(row?.text).toBe(
      '<h2 id="vertical-space">Vertical space</h2><p>When floor space is limited, look up.</p>',
    );
  });

  it("uses an image with no blank line before its text, and keeps text written before it", () => {
    const [after] = rowParts(`## Kitchen\n${imageMarkdown(B)}\nA small kitchen holds a lot.`);
    expect(after?.media).toContain(B.src);
    expect(after?.text).toContain("<p>A small kitchen holds a lot.</p>");
    expect(after?.text).not.toContain("<br/>");

    const [before] = rowParts(`## Kitchen\nGroup items by use.\n${imageMarkdown(B)}`);
    expect(before?.media).toContain(B.src);
    expect(before?.text).toContain("<p>Group items by use.</p>");
  });

  it("puts the section's first image in the row and leaves later images in the text", () => {
    const [row] = rowParts(
      [`## Kitchen\n${imageMarkdown(B)}\nIntro text.`, "More text.", imageMarkdown(A, "Later image")].join(
        "\n\n",
      ),
    );
    expect(row?.media).toContain(B.src);
    expect(row?.media).not.toContain(A.src);
    expect(row?.text).toContain(`<figure><img src="${A.src}"`);
    expect(row?.text).toContain("<figcaption>Later image</figcaption>");
  });

  it("follows the real editor pattern: no blank lines, a second image and long text", () => {
    const rows = rowParts(
      [
        "Intro.",
        `## 1. Vertical space\n${imageMarkdown(A)} When floor space is limited, look up.`,
        "Consider wall shelves.",
        `## 2. Kitchen routine\n${imageMarkdown(B)}\nA small kitchen holds a lot.`,
        "Group items by use.",
        imageMarkdown(A, "Later image"),
        "Long text. ".repeat(100),
      ].join("\n\n"),
    );
    expect(rows.map((row) => row.attrs)).toEqual([' data-side="image-left"', ' data-side="image-right"']);
    expect(rows[0]?.media).toContain(A.src);
    expect(rows[0]?.text).toContain("Consider wall shelves.");
    expect(rows[1]?.media).toContain(B.src);
    expect(rows[1]?.text).toContain("<figcaption>Later image</figcaption>");
  });
});

describe("removing an image from the editor preview", () => {
  const body = [
    "## Shelf",
    "Before.",
    imageMarkdown(A, "First caption"),
    imageMarkdown(B),
    `Inline ${imageMarkdown(A)} in a sentence.`,
    imageMarkdown(A),
    "After.",
  ].join("\n\n");

  it("renders a labelled Remove button for every library image", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { markdown: body, onRemoveImage: () => undefined }),
    );
    expect(html.match(/<button type="button"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Remove image “Labelled jars in a drawer” from the article"');
  });

  it("removes only the clicked image, leaving the other copies and the text", () => {
    let next = body;
    const buttons = removeButtons(body, ({ start, end }) => {
      next = removeImageAt(body, start, end);
    });
    expect(buttons).toHaveLength(4);

    buttons[0]!.props.onClick!();
    expect(next).toBe(
      [
        "## Shelf",
        "Before.",
        imageMarkdown(B),
        `Inline ${imageMarkdown(A)} in a sentence.`,
        imageMarkdown(A),
        "After.",
      ].join("\n\n"),
    );

    buttons[2]!.props.onClick!();
    expect(next).toContain("Inline in a sentence.");
    expect(next.match(/!\[/g)).toHaveLength(3);

    buttons[3]!.props.onClick!();
    expect(next.endsWith(`in a sentence.\n\nAfter.`)).toBe(true);
  });

  it("ignores a range that no longer holds an image", () => {
    expect(removeImageAt(body, 0, 5)).toBe(body);
    expect(removeImageAt(body, -1, 3)).toBe(body);
    expect(removeImageAt(body, 10, body.length + 5)).toBe(body);
  });

  it("joins the text around an image at the very start or end", () => {
    const only = imageMarkdown(A);
    expect(removeImageAt(`${only}\n\nText.`, 0, only.length)).toBe("Text.");
    expect(removeImageAt(`Text.\n\n${only}`, 7, 7 + only.length)).toBe("Text.");
    expect(removeImageAt(only, 0, only.length)).toBe("");
  });
});
