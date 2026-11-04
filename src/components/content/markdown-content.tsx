import type { CSSProperties } from "react";
import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import {
  ARTICLE_IMAGE_DEFAULTS,
  type ArticleImageStyle,
  articleImageCssVars,
  splitImageSrc,
} from "@/lib/content/article-image-style";
import { type BodyImageSizes, mediaFileKey } from "@/lib/content/body-images";

/** Only https links, site-relative paths and in-page anchors are rendered as links. */
export function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("https://")) return href;
  return null;
}

/** Body images must come from the site's own media library. The fragment holds the image's own look. */
function libraryImage(src: unknown): { src: string; style: Partial<ArticleImageStyle> | null } | null {
  if (typeof src !== "string") return null;
  const { path, style } = splitImageSrc(src);
  return /^\/media\/[0-9a-f-]{36}\/[^/#]+$/.test(path) ? { src: path, style } : null;
}

function safeImageSrc(src: unknown): string | null {
  return libraryImage(src)?.src ?? null;
}

function ownImageStyle(style: Partial<ArticleImageStyle> | null) {
  return style ? articleImageCssVars({ ...ARTICLE_IMAGE_DEFAULTS, ...style }, true) : undefined;
}

type HastElement = NonNullable<ExtraProps["node"]>;

/** A paragraph holding nothing but one library image is shown as a figure, captioned by the image title. */
export function standaloneImage(node: HastElement | undefined): { caption: string } | null {
  if (!node) return null;
  const content = node.children.filter((child) => !(child.type === "text" && !child.value.trim()));
  const [only] = content;
  if (content.length !== 1 || only?.type !== "element" || only.tagName !== "img") return null;
  if (!safeImageSrc(only.properties.src)) return null;
  const title = only.properties.title;
  return { caption: typeof title === "string" ? title.trim() : "" };
}

function publicComponents(imageSizes?: BodyImageSizes): Components {
  return {
    // The guide title is the page's only H1; demote any H1 written in the body.
    h1: ({ node: _node, ...props }) => <h2 {...props} />,
    // Article styles draw their own step numbers, so the counter must honour a list's start number.
    // role="list" keeps list semantics in Safari once the default markers are removed.
    ol: ({ node: _node, start, ...props }) => (
      <ol
        role="list"
        start={start}
        style={start !== undefined && start !== 1 ? { counterReset: `step ${start - 1}` } : undefined}
        {...props}
      />
    ),
    p: ({ node, children, ...props }) => {
      const image = standaloneImage(node);
      if (!image) return <p {...props}>{children}</p>;
      return (
        <figure>
          {children}
          {image.caption ? <figcaption>{image.caption}</figcaption> : null}
        </figure>
      );
    },
    a: ({ node: _node, href, children, ...props }) => {
      const safe = safeHref(href);
      if (!safe) return <span>{children}</span>;
      if (safe.startsWith("/") || safe.startsWith("#")) {
        return (
          <Link href={safe} {...props}>
            {children}
          </Link>
        );
      }
      return (
        <a href={safe} rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
    img: ({ node: _node, src, alt }) => {
      const image = libraryImage(src);
      if (!image) return alt ? <span>{alt}</span> : null;
      const key = mediaFileKey(image.src);
      const size = key ? imageSizes?.[key] : undefined;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          alt={alt ?? ""}
          width={size?.width}
          height={size?.height}
          loading="lazy"
          decoding="async"
          style={ownImageStyle(image.style)}
        />
      );
    },
  };
}

/** Where an image's Markdown sits in the source, as character offsets. */
export type SourceRange = { start: number; end: number };

export type EditableImage = SourceRange & {
  src: string;
  alt: string;
  /** The image's own settings, or null when it uses the article's. */
  style: Partial<ArticleImageStyle> | null;
};

const imageButtonClasses =
  "rounded-full border border-line bg-surface/95 px-3 py-1 font-sans text-xs font-medium shadow-sm hover:bg-surface";

/** The editor preview: every image gets buttons to edit its look or remove it from the Markdown. */
function editableComponents({
  onRemoveImage,
  onEditImage,
}: {
  onRemoveImage?: (range: SourceRange) => void;
  onEditImage?: (image: EditableImage) => void;
}): Components {
  return {
    ...publicComponents(),
    img: ({ node, src, alt }) => {
      const image = libraryImage(src);
      if (!image) return alt ? <span>{alt}</span> : null;
      const start = node?.position?.start.offset;
      const end = node?.position?.end.offset;
      const label = alt ? `image “${alt}”` : "image";
      return (
        <span className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={alt ?? ""} loading="lazy" decoding="async" />
          {start !== undefined && end !== undefined ? (
            <span className="absolute top-2 right-2 flex gap-1.5">
              {onEditImage ? (
                <button
                  type="button"
                  onClick={() =>
                    onEditImage({ start, end, src: image.src, alt: alt ?? "", style: image.style })
                  }
                  aria-label={`Edit how the ${label} is shown`}
                  className={`${imageButtonClasses} text-oak-deep`}
                >
                  Edit
                </button>
              ) : null}
              {onRemoveImage ? (
                <button
                  type="button"
                  onClick={() => onRemoveImage({ start, end })}
                  aria-label={`Remove ${label} from the article`}
                  className={`${imageButtonClasses} text-danger`}
                >
                  Remove
                </button>
              ) : null}
            </span>
          ) : null}
        </span>
      );
    },
  };
}

type HastChild = HastElement["children"][number];

function hastElement(
  tagName: string,
  className: string,
  children: HastChild[],
  data: Record<string, string> = {},
): HastElement {
  return { type: "element", tagName, properties: { className: [className], ...data }, children };
}

function isLibraryImage(node: HastChild): node is HastElement {
  return node.type === "element" && node.tagName === "img" && safeImageSrc(node.properties.src) !== null;
}

function isBlank(node: HastChild | undefined): boolean {
  if (!node) return false;
  return (node.type === "text" && !node.value.trim()) || (node.type === "element" && node.tagName === "br");
}

/**
 * Takes the first library image out of a section's paragraphs. An image written on the same line as
 * text, or with no blank line after it, is split from that text so the text stays in the section.
 */
function takeFirstImage(section: HastChild[]): HastElement | null {
  for (const [index, child] of section.entries()) {
    if (child.type !== "element" || child.tagName !== "p") continue;
    if (standaloneImage(child)) {
      section.splice(index, 1);
      return child;
    }
    const at = child.children.findIndex(isLibraryImage);
    if (at === -1) continue;
    const image = child.children[at] as HastElement;
    const before = child.children.slice(0, at);
    const after = child.children.slice(at + 1);
    while (isBlank(before.at(-1))) before.pop();
    while (isBlank(after[0])) after.shift();
    const last = before.at(-1);
    if (last?.type === "text") before[before.length - 1] = { ...last, value: last.value.trimEnd() };
    const first = after[0];
    if (first?.type === "text") after[0] = { ...first, value: first.value.trimStart() };
    const rest = [...before, ...after];
    if (rest.length > 0) section[index] = { ...child, children: rest };
    else section.splice(index, 1);
    return { type: "element", tagName: "p", properties: {}, children: [image] };
  }
  return null;
}

/**
 * Article layout: every `##` section that contains a library image becomes a two-column row, with
 * the section's first image in one column and the heading and text in the other. Narrow screens
 * stack the heading, the image and then the text (see prose-article); wider screens alternate the
 * image's side from row to row. Sections without an image, and anything before the first `##`, are
 * left as they are.
 */
export function rehypeImageRows() {
  return (tree: { children: HastChild[] }) => {
    const output: HastChild[] = [];
    let rows = 0;
    const flush = (section: HastChild[]) => {
      const image = takeFirstImage(section);
      if (!image) {
        output.push(...section);
        return;
      }
      const side = rows % 2 === 0 ? "image-left" : "image-right";
      rows += 1;
      output.push(
        hastElement(
          "div",
          "article-row",
          [hastElement("div", "article-row-media", [image]), hastElement("div", "article-row-text", section)],
          { dataSide: side },
        ),
      );
    };

    let section: HastChild[] | null = null;
    for (const child of tree.children) {
      if (child.type === "element" && child.tagName === "h2") {
        if (section) flush(section);
        section = [child];
      } else if (section) {
        section.push(child);
      } else {
        output.push(child);
      }
    }
    if (section) flush(section);
    tree.children = output;
  };
}

export function MarkdownContent({
  markdown,
  className,
  style,
  onRemoveImage,
  onEditImage,
  layout = "plain",
  imageSizes,
}: {
  markdown: string;
  className?: string;
  style?: CSSProperties;
  onRemoveImage?: (range: SourceRange) => void;
  onEditImage?: (image: EditableImage) => void;
  /** `article` lays out sections with an image as alternating image-and-text rows. */
  layout?: "plain" | "article";
  /** Lets body images reserve their space before they load. */
  imageSizes?: BodyImageSizes;
}) {
  return (
    <div className={className} style={style}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={layout === "article" ? [rehypeSlug, rehypeImageRows] : [rehypeSlug]}
        components={
          onRemoveImage || onEditImage
            ? editableComponents({ onRemoveImage, onEditImage })
            : publicComponents(imageSizes)
        }
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
