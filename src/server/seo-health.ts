import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { guides, mediaAssets } from "@/db/schema";
import type { Db } from "@/db/types";
import { CATEGORY_SLUGS, type CategorySlug } from "@/content/categories";
import { seoHealth, type SeoGuideReport, type SeoHealthGuide } from "@/lib/content/seo-health";

export type CategoryCoverage = { slug: CategorySlug; published: number; drafts: number };

export type SeoHealthReport = { guides: SeoGuideReport[]; categories: CategoryCoverage[] };

/** Checks the latest saved version of every article, so problems can be fixed before publishing. */
export async function seoHealthReport(db: Db): Promise<SeoHealthReport> {
  const rows: SeoHealthGuide[] = await db
    .select({
      id: guides.id,
      slug: guides.slug,
      title: guides.title,
      excerpt: guides.excerpt,
      body: guides.body,
      closing: guides.closing,
      category: guides.category,
      seoTitle: guides.seoTitle,
      seoDescription: guides.seoDescription,
      featuredImageId: mediaAssets.id,
      featuredImageAlt: sql<
        string | null
      >`coalesce(nullif(trim(${guides.featuredImageAlt}), ''), ${mediaAssets.altText})`,
      faqCount: sql<number>`jsonb_array_length(${guides.faqs})::int`,
      published: sql<boolean>`${guides.publishedRevisionId} is not null`,
    })
    .from(guides)
    .leftJoin(mediaAssets, eq(guides.featuredImageId, mediaAssets.id))
    .orderBy(asc(guides.title));

  const categories = CATEGORY_SLUGS.map((slug) => ({
    slug,
    published: rows.filter((row) => row.category === slug && row.published).length,
    drafts: rows.filter((row) => row.category === slug && !row.published).length,
  }));
  return { guides: seoHealth(rows), categories };
}
