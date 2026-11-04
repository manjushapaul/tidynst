import type { MetadataRoute } from "next";
import { categoryPath, guidePath, subcategoryPath, type CategorySlug } from "@/content/categories";
import { absoluteUrl } from "@/lib/site";

export const STATIC_SITEMAP_PATHS = [
  "/",
  "/guides",
  "/about",
  "/editorial-policy",
  "/contact",
  "/privacy",
  "/affiliate-disclosure",
] as const;

export type SitemapInput = {
  indexingEnabled: boolean;
  guides: ReadonlyArray<{
    slug: string;
    category: CategorySlug | null;
    updatedAt: Date;
    /** Image paths on the page, listed so they can be found through Google Images. */
    images?: readonly string[];
  }>;
  /** Categories with at least one published guide (empty hubs are noindex). */
  categories: ReadonlyArray<{ slug: CategorySlug; updatedAt: Date }>;
  /** Topics with at least one published guide. */
  topics: ReadonlyArray<{ slug: string; updatedAt: Date }>;
  /** Subcategories with at least one published guide. */
  subcategories?: ReadonlyArray<{ category: CategorySlug; slug: string; updatedAt: Date }>;
};

/**
 * Only indexable, canonical URLs belong in the sitemap. While site indexing is disabled nothing is
 * indexable, so the sitemap is empty. Search, admin, drafts and empty collections are never listed.
 */
export function buildSitemap(input: SitemapInput): MetadataRoute.Sitemap {
  if (!input.indexingEnabled) return [];
  const latest = input.guides.reduce<Date | undefined>(
    (max, guide) => (!max || guide.updatedAt > max ? guide.updatedAt : max),
    undefined,
  );
  const hasGuides = input.guides.length > 0;
  return [
    ...STATIC_SITEMAP_PATHS.filter((path) => path !== "/guides" || hasGuides).map((path) => ({
      url: absoluteUrl(path),
      ...((path === "/" || path === "/guides") && latest ? { lastModified: latest } : {}),
    })),
    ...input.categories.map((category) => ({
      url: absoluteUrl(categoryPath(category.slug)),
      lastModified: category.updatedAt,
    })),
    ...input.topics.map((topic) => ({
      url: absoluteUrl(`/topics/${topic.slug}`),
      lastModified: topic.updatedAt,
    })),
    ...(input.subcategories ?? []).map((area) => ({
      url: absoluteUrl(subcategoryPath(area.category, area.slug)),
      lastModified: area.updatedAt,
    })),
    ...input.guides.map((guide) => ({
      url: absoluteUrl(guidePath(guide)),
      lastModified: guide.updatedAt,
      ...(guide.images?.length ? { images: guide.images.map((image) => absoluteUrl(image)) } : {}),
    })),
  ];
}

export function buildRobots(indexingEnabled: boolean): MetadataRoute.Robots {
  if (!indexingEnabled) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/search"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
