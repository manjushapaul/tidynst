import { createHash } from "node:crypto";
import { isDefaultArticleImageStyle } from "./article-image-style";
import { isDefaultFeaturedImageStyle } from "./featured-image-style";
import type { GuideContent } from "./guide-schema";

/**
 * Stable SHA-256 over every material field. Topic order is not meaningful and is sorted;
 * product and FAQ order is meaningful (it is the reading order) and is preserved.
 */
export function guideContentHash(content: GuideContent): string {
  const canonical = [
    content.title,
    content.slug,
    content.excerpt,
    content.body,
    content.category,
    // Appended only when set so articles saved before subcategories existed keep their stored hash.
    ...(content.subcategoryId ? [content.subcategoryId] : []),
    ...(content.subcategoryGroupId ? [content.subcategoryGroupId] : []),
    [...content.topicIds].sort(),
    content.products.map((item) => [item.productId, item.note]),
    content.seoTitle,
    content.seoDescription,
    content.featuredImageId,
    content.featuredImageAlt,
    // Appended only when present so articles saved before FAQs/closing existed keep their stored hash.
    ...(content.faqs.length > 0 ? [content.faqs.map((faq) => [faq.question, faq.answer])] : []),
    ...(content.closing ? [content.closing] : []),
    // Appended only when changed from the defaults, so existing articles keep their stored hash.
    ...(isDefaultArticleImageStyle(content.articleImageStyle)
      ? []
      : [
          [
            "articleImageStyle",
            content.articleImageStyle.aspectRatio,
            content.articleImageStyle.objectFit,
            content.articleImageStyle.borderRadius,
            content.articleImageStyle.width,
            content.articleImageStyle.height,
          ],
        ]),
    ...(isDefaultFeaturedImageStyle(content.featuredImageStyle)
      ? []
      : [
          [
            "featuredImageStyle",
            content.featuredImageStyle.objectFit,
            content.featuredImageStyle.objectPosition,
          ],
        ]),
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
