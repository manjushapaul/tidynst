import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "./db";
import { getPublishedGuide, getTopic } from "./public-content";

/**
 * Request-scoped loaders shared by generateMetadata and the page component. `connection()` marks
 * the route as dynamic, so builds never query the database and published changes appear at once.
 */

export const loadPublishedGuide = cache(async (slug: string) => {
  await connection();
  return getPublishedGuide(getDb(), slug);
});

export const loadTopic = cache(async (slug: string) => {
  await connection();
  return getTopic(getDb(), slug);
});

export async function publicDb() {
  await connection();
  return getDb();
}
