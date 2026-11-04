import "server-only";
import { revalidatePath } from "next/cache";
import { forgetMediaVisibility } from "@/server/media-access";

/**
 * Refreshes every public page that can list or show an article. Called only after the database
 * transaction has committed; a failure here must never be reported as a failed publish, because
 * the change is already live in the database.
 */
export function revalidatePublicContent(change?: { slug: string }): boolean {
  forgetMediaVisibility();
  try {
    revalidatePath("/");
    revalidatePath("/guides");
    if (change) revalidatePath(`/guides/${change.slug}`);
    revalidatePath("/guides/[slug]", "page");
    revalidatePath("/categories/[slug]", "page");
    revalidatePath("/categories/[slug]/[article]", "page");
    revalidatePath("/topics/[slug]", "page");
    revalidatePath("/search");
    revalidatePath("/sitemap.xml");
    return true;
  } catch (error) {
    console.error("Public page refresh failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

export const REFRESH_WARNING =
  "The public pages could not be refreshed automatically; they will update on the next request.";
