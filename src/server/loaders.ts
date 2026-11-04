import "server-only";
import { connection } from "next/server";
import { permanentRedirect } from "next/navigation";
import { cache } from "react";
import { guidePath } from "@/content/categories";
import { getDb } from "./db";
import { getPublicHomepage, type PublicHomepage } from "./homepage";
import { findRenamedGuide, getPublishedGuide, getTopic } from "./public-content";
import { subcategoryPreviewLines } from "./subcategories";

/**
 * Request-scoped loaders shared by generateMetadata and the page component. `connection()` marks
 * the route as dynamic, so builds never query the database and published changes appear at once.
 */

export const loadPublishedGuide = cache(async (slug: string) => {
  await connection();
  return getPublishedGuide(getDb(), slug);
});

const loadRenamedGuide = cache(async (slug: string) => {
  await connection();
  return findRenamedGuide(getDb(), slug);
});

/** Sends links to an article's earlier address to its current one. Returns if there is none. */
export async function redirectRenamedGuide(slug: string): Promise<void> {
  const current = await loadRenamedGuide(slug);
  if (current) permanentRedirect(guidePath(current));
}

export const loadTopic = cache(async (slug: string) => {
  await connection();
  return getTopic(getDb(), slug);
});

export async function publicDb() {
  await connection();
  return getDb();
}

/** Homepage, header and category presentation for this request. */
export const loadPublicSite = cache(async (): Promise<PublicHomepage> => {
  await connection();
  const db = getDb();
  const [home, lines] = await Promise.all([getPublicHomepage(db), subcategoryPreviewLines(db)]);
  return {
    ...home,
    categories: home.categories.map((category) => {
      const covers = lines[category.slug];
      return covers?.length ? { ...category, covers } : category;
    }),
  };
});
