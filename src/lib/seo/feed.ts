import { absoluteUrl, site } from "@/lib/site";
import { FEED_PATH } from "./metadata";

export type FeedItem = {
  title: string;
  description: string;
  path: string;
  publishedAt: Date;
  category?: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 for the newest published guides. Items are expected newest first. */
export function buildRssFeed(input: {
  title: string;
  description: string;
  items: readonly FeedItem[];
}): string {
  const latest = input.items[0]?.publishedAt;
  const items = input.items.map((item) => {
    const url = escapeXml(absoluteUrl(item.path));
    return [
      "    <item>",
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <pubDate>${item.publishedAt.toUTCString()}</pubDate>`,
      `      <description>${escapeXml(item.description)}</description>`,
      ...(item.category ? [`      <category>${escapeXml(item.category)}</category>`] : []),
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(input.title)}</title>`,
    `    <link>${escapeXml(absoluteUrl("/"))}</link>`,
    `    <description>${escapeXml(input.description)}</description>`,
    `    <language>${site.language.toLowerCase()}</language>`,
    `    <atom:link href="${escapeXml(absoluteUrl(FEED_PATH))}" rel="self" type="application/rss+xml" />`,
    ...(latest ? [`    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>`] : []),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
