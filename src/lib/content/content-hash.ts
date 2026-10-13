import { createHash } from "node:crypto";
import type { GuideContent } from "./guide-schema";

/**
 * Stable SHA-256 over every material field. Topic order is not meaningful and is sorted;
 * product order is meaningful (it is the recommended order) and is preserved.
 */
export function guideContentHash(content: GuideContent): string {
  const canonical = [
    content.title,
    content.slug,
    content.excerpt,
    content.body,
    content.category,
    [...content.topicIds].sort(),
    content.products.map((item) => [item.productId, item.note]),
    content.seoTitle,
    content.seoDescription,
    content.featuredImageId,
    content.featuredImageAlt,
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
