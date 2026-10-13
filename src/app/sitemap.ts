import type { MetadataRoute } from "next";
import { connection } from "next/server";
import type { CategorySlug } from "@/content/categories";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { buildSitemap } from "@/lib/seo/sitemap";
import { getDb } from "@/server/db";
import { listSitemapGuides, listTopics, type SitemapGuide } from "@/server/public-content";

function latestByKey<K extends string>(guides: readonly SitemapGuide[], key: (guide: SitemapGuide) => K[]) {
  const latest = new Map<K, Date>();
  for (const guide of guides) {
    for (const value of key(guide)) {
      const current = latest.get(value);
      if (!current || guide.updatedAt > current) latest.set(value, guide.updatedAt);
    }
  }
  return latest;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  if (!isIndexingEnabled())
    return buildSitemap({ indexingEnabled: false, guides: [], categories: [], topics: [] });

  const db = getDb();
  const [guides, topics] = await Promise.all([listSitemapGuides(db), listTopics(db)]);
  const byCategory = latestByKey<CategorySlug>(guides, (guide) => (guide.category ? [guide.category] : []));
  const byTopic = latestByKey<string>(guides, (guide) => guide.topicSlugs);

  return buildSitemap({
    indexingEnabled: true,
    guides,
    categories: [...byCategory].map(([slug, updatedAt]) => ({ slug, updatedAt })),
    topics: topics
      .filter((topic) => topic.guideCount > 0 && byTopic.has(topic.slug))
      .map((topic) => ({ slug: topic.slug, updatedAt: byTopic.get(topic.slug)! })),
  });
}
