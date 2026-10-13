import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { buildRobots } from "@/lib/seo/sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return buildRobots(isIndexingEnabled());
}
