import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import type { GuideContent } from "@/lib/content/guide-schema";

/** Synthetic body text for tests only (never shipped as site content), within the publish length. */
export function publishableBody(): string {
  return [
    "## Start with what you use daily",
    "Keep the masala dabba, oil and salt within reach of the stove.",
    "## Keep heavy items low",
    "Store pots and grain tins below the counter.",
  ].join("\n\n");
}

export function guideContent(overrides: Partial<GuideContent> = {}): GuideContent {
  return {
    title: "How to organise a small kitchen platform",
    slug: "organise-small-kitchen-platform",
    excerpt:
      "A practical approach to clearing and arranging a compact Indian kitchen platform so daily cooking feels calmer.",
    body: publishableBody(),
    closing: "",
    category: "kitchen",
    subcategoryId: null,
    subcategoryGroupId: null,
    topicIds: [],
    products: [],
    seoTitle: null,
    seoDescription: null,
    featuredImageId: null,
    featuredImageAlt: null,
    featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
    faqs: [],
    articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
    ...overrides,
  };
}
