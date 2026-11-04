import { connection } from "next/server";
import { getCategory, guidePath } from "@/content/categories";
import { buildRssFeed } from "@/lib/seo/feed";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { site } from "@/lib/site";
import { getDb } from "@/server/db";
import { getPublicHomepage } from "@/server/homepage";
import { listPublishedGuides } from "@/server/public-content";

const FEED_SIZE = 30;

export async function GET() {
  await connection();
  // Like the sitemap, the feed only advertises the site once it is open to search engines.
  if (!isIndexingEnabled()) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const db = getDb();
  const [guides, home] = await Promise.all([
    listPublishedGuides(db, { limit: FEED_SIZE }),
    getPublicHomepage(db).catch(() => null),
  ]);
  const categoryName = (slug: NonNullable<(typeof guides)[number]["category"]>) =>
    home?.categories.find((category) => category.slug === slug)?.name ?? getCategory(slug)?.name;

  const xml = buildRssFeed({
    title: home?.name ?? site.name,
    description: home?.description ?? site.description,
    items: guides.map((guide) => ({
      title: guide.title,
      description: guide.excerpt,
      path: guidePath(guide),
      publishedAt: guide.firstPublishedAt,
      category: guide.category ? categoryName(guide.category) : undefined,
    })),
  });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
