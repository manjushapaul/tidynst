import type { Crumb } from "@/components/site/breadcrumbs";
import { absoluteUrl, site } from "@/lib/site";

type JsonLd = Record<string, unknown>;

const organizationId = `${site.url}/#organization`;

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: site.name,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") },
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: site.name,
    url: absoluteUrl("/"),
    description: site.description,
    inLanguage: site.language,
    publisher: { "@id": organizationId },
  };
}

export function breadcrumbJsonLd(items: readonly Crumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export type ArticleInput = {
  title: string;
  description: string;
  path: string;
  datePublished: Date;
  dateModified: Date;
  image?: { src: string; width: number; height: number } | null;
  section?: string;
};

/**
 * Article markup. The author is the editorial team (an Organization), never an invented person.
 * No ratings or reviews are emitted because the site does not collect them.
 */
export function articleJsonLd(input: ArticleInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(input.path) },
    url: absoluteUrl(input.path),
    datePublished: input.datePublished.toISOString(),
    dateModified: input.dateModified.toISOString(),
    inLanguage: site.language,
    ...(input.section ? { articleSection: input.section } : {}),
    ...(input.image
      ? {
          image: {
            "@type": "ImageObject",
            url: absoluteUrl(input.image.src),
            width: input.image.width,
            height: input.image.height,
          },
        }
      : {}),
    author: { "@type": "Organization", name: site.editorialName, url: absoluteUrl("/about") },
    publisher: { "@id": organizationId, "@type": "Organization", name: site.name },
  };
}

/** Serialises JSON-LD safely for embedding in a <script> element. */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
