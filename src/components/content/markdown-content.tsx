import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

/** Only https links, site-relative paths and in-page anchors are rendered as links. */
export function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("https://")) return href;
  return null;
}

/** Body images must come from the site's own media library. */
function safeImageSrc(src: unknown): string | null {
  return typeof src === "string" && /^\/media\/[0-9a-f-]{36}\/[^/]+$/.test(src) ? src : null;
}

const components: Components = {
  // The guide title is the page's only H1; demote any H1 written in the body.
  h1: ({ node: _node, ...props }) => <h2 {...props} />,
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
    const safe = safeImageSrc(src);
    if (!safe) return alt ? <span>{alt}</span> : null;
    // Body images are user-uploaded media of varying size; dimensions are not known here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={safe} alt={alt ?? ""} loading="lazy" decoding="async" />;
  },
};

export function MarkdownContent({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={components}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
