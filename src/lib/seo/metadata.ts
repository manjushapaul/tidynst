import type { Metadata } from "next";
import { absoluteUrl, site } from "@/lib/site";
import { isIndexingEnabled } from "./indexing";

type PageMetadataInput = {
  title: string;
  description: string;
  /** Canonical path, e.g. `/guides/foo`. Always without query string. */
  path: string;
  /** Page-level opt-out, e.g. search results or empty collections. */
  noindex?: boolean;
  /** Use the title verbatim instead of the "%s | TidyNest" template. */
  absoluteTitle?: boolean;
  openGraph?: {
    type?: "website" | "article";
    publishedTime?: string;
    modifiedTime?: string;
    images?: Array<{ url: string; width?: number; height?: number; alt: string }>;
  };
};

export function robotsFor(noindex: boolean | undefined): Metadata["robots"] {
  const index = isIndexingEnabled() && !noindex;
  return index
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } }
    : { index: false, follow: true };
}

export const DEFAULT_OG_IMAGE = { url: "/og/default", width: 1200, height: 630, alt: site.name };

export function pageMetadata(input: PageMetadataInput): Metadata {
  const url = absoluteUrl(input.path);
  const images = input.openGraph?.images ?? [DEFAULT_OG_IMAGE];
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: url },
    robots: robotsFor(input.noindex),
    openGraph: {
      type: input.openGraph?.type ?? "website",
      url,
      title: input.title,
      description: input.description,
      siteName: site.name,
      locale: site.locale,
      ...(input.openGraph?.publishedTime ? { publishedTime: input.openGraph.publishedTime } : {}),
      ...(input.openGraph?.modifiedTime ? { modifiedTime: input.openGraph.modifiedTime } : {}),
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: images.map((image) => image.url),
    },
  };
}
