import type { GuideContent } from "@/lib/content/guide-schema";

const paragraph =
  "Small kitchens in Indian homes often have one platform that holds the stove, the mixer grinder and daily masalas, so storage needs to keep the essentials close without crowding the cooking area.";

/** Synthetic body text for tests only (never shipped as site content). */
export function longBody(words = 320): string {
  const sentence = paragraph.split(" ");
  const out: string[] = [];
  while (out.length < words) out.push(...sentence);
  return `## Start with what you use daily\n\n${out.slice(0, words).join(" ")}\n\n## Keep heavy items low\n\nMore detail.`;
}

export function guideContent(overrides: Partial<GuideContent> = {}): GuideContent {
  return {
    title: "How to organise a small kitchen platform",
    slug: "organise-small-kitchen-platform",
    excerpt:
      "A practical approach to clearing and arranging a compact Indian kitchen platform so daily cooking feels calmer.",
    body: longBody(),
    category: "kitchen",
    topicIds: [],
    products: [],
    seoTitle: null,
    seoDescription: null,
    featuredImageId: null,
    featuredImageAlt: null,
    ...overrides,
  };
}
