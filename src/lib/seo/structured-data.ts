import type { Crumb } from "@/components/site/breadcrumbs";
import { absoluteUrl, site } from "@/lib/site";

type JsonLd = Record<string, unknown>;

const organizationId = `${site.url}/#organization`;

export function organizationJsonLd(brand?: { name?: string; logoUrl?: string | null }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: brand?.name ?? site.name,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl(brand?.logoUrl || "/icon.svg") },
  };
}

export function websiteJsonLd(brand?: { name?: string; description?: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: brand?.name ?? site.name,
    url: absoluteUrl("/"),
    description: brand?.description ?? site.description,
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

export type CollectionInput = {
  name: string;
  description: string;
  /** Canonical path of this page of the listing, including `?page=` after the first page. */
  path: string;
  items: ReadonlyArray<{ name: string; path: string }>;
  /** Position of the first item, so later pages continue the numbering. */
  firstPosition?: number;
};

/** A category, subcategory or topic hub and the guides listed on this page of it. */
export function collectionPageJsonLd(input: CollectionInput): JsonLd {
  const first = input.firstPosition ?? 1;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    inLanguage: site.language,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: input.items.map((item, index) => ({
        "@type": "ListItem",
        position: first + index,
        name: item.name,
        url: absoluteUrl(item.path),
      })),
    },
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
  publisherName?: string;
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
    publisher: { "@id": organizationId, "@type": "Organization", name: input.publisherName ?? site.name },
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
