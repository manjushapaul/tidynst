import { countCharacters, extractHeadings, extractLinks } from "./markdown";
import { GUIDE_LIMITS, type GuideContent } from "./guide-schema";

export const PUBLISH_RULES = {
  titleMin: 10,
  titleMax: 100,
  excerptMin: 100,
  excerptMax: GUIDE_LIMITS.excerptMax,
  metaDescriptionMin: 70,
  metaDescriptionMax: 160,
  seoTitleMin: 10,
  seoTitleMax: 65,
} as const;

export type PublishIssue = { field: keyof GuideContent; message: string };

export type PublishContext = {
  /** Status of every product referenced by the guide, keyed by id. Missing means it no longer exists. */
  productStatus: ReadonlyMap<string, "draft" | "active" | "retired">;
  /** Ids of topics that exist. */
  knownTopicIds: ReadonlySet<string>;
  /** Whether the featured image asset exists. */
  featuredImageExists: boolean;
  /** Ids of library images that exist, checked against `/media/<id>/…` links in the body. Omit to skip. */
  knownMediaIds?: ReadonlySet<string>;
};

const PLACEHOLDER = /\b(lorem ipsum|todo|tbd|tk tk|xxx+|placeholder text)\b/i;
const MEDIA_LINK = /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

/** Library image ids linked from the body (`/media/<id>/<filename>`), lower-cased and de-duplicated. */
export function bodyMediaIds(body: string): string[] {
  const ids = new Set<string>();
  for (const link of extractLinks(body)) {
    const match = MEDIA_LINK.exec(link.url);
    if (match?.[1]) ids.add(match[1].toLowerCase());
  }
  // Rich editor image layouts are stored as URI-encoded JSON inside a fenced Markdown block.
  // Keep media authorization, retention and publishing checks aware of those asset references.
  for (const match of body.matchAll(/```tidynest-images\s*\n([^\n]+)\n```/g)) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1]!)) as { images?: Array<{ src?: unknown }> };
      for (const image of parsed.images ?? []) {
        if (typeof image.src !== "string") continue;
        const media = MEDIA_LINK.exec(image.src);
        if (media?.[1]) ids.add(media[1].toLowerCase());
      }
    } catch {
      // Invalid blocks are ignored here and remain visible as an editor validation issue.
    }
  }
  return [...ids];
}

function structuredImageBlocks(body: string) {
  return [...body.matchAll(/```tidynest-images\s*\n([^\n]+)\n```/g)].flatMap((match) => {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1]!)) as {
        images?: Array<{ src?: unknown; alt?: unknown }>;
      };
      return parsed.images ?? [];
    } catch {
      return [];
    }
  });
}

/**
 * Stricter checks applied when publishing (drafts may be incomplete). Returns every problem so
 * the editor can fix them in one pass.
 */
export function publishIssues(content: GuideContent, context: PublishContext): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const add = (field: keyof GuideContent, message: string) => issues.push({ field, message });

  if (content.title.length < PUBLISH_RULES.titleMin || content.title.length > PUBLISH_RULES.titleMax) {
    add("title", `Title must be ${PUBLISH_RULES.titleMin}–${PUBLISH_RULES.titleMax} characters to publish.`);
  }

  if (!content.category) add("category", "Choose a category before publishing.");

  if (
    content.excerpt.length < PUBLISH_RULES.excerptMin ||
    content.excerpt.length > PUBLISH_RULES.excerptMax
  ) {
    add(
      "excerpt",
      `Summary must be ${PUBLISH_RULES.excerptMin}–${PUBLISH_RULES.excerptMax} characters to publish.`,
    );
  }

  if (content.seoTitle) {
    const length = content.seoTitle.length;
    if (length < PUBLISH_RULES.seoTitleMin || length > PUBLISH_RULES.seoTitleMax) {
      add(
        "seoTitle",
        `SEO title must be ${PUBLISH_RULES.seoTitleMin}–${PUBLISH_RULES.seoTitleMax} characters.`,
      );
    }
  }

  const metaDescription = content.seoDescription ?? content.excerpt;
  if (
    metaDescription.length < PUBLISH_RULES.metaDescriptionMin ||
    metaDescription.length > PUBLISH_RULES.metaDescriptionMax
  ) {
    add(
      "seoDescription",
      content.seoDescription
        ? `Meta description must be ${PUBLISH_RULES.metaDescriptionMin}–${PUBLISH_RULES.metaDescriptionMax} characters.`
        : `Add a meta description (${PUBLISH_RULES.metaDescriptionMin}–${PUBLISH_RULES.metaDescriptionMax} characters); the summary is not a suitable length to use instead.`,
    );
  }

  if (countCharacters(content.body) === 0) add("body", "Add the article text before publishing.");

  const headings = extractHeadings(content.body);
  if (headings.some((heading) => heading.depth === 1)) {
    add("body", "Do not use a level-1 heading (#) in the body; the article title is the page's only H1.");
  }
  let previousDepth = 1;
  for (const heading of headings) {
    if (heading.depth > previousDepth + 1) {
      add("body", `Heading "${heading.text}" skips a level. Use ## before ###, and ### before ####.`);
      break;
    }
    previousDepth = heading.depth;
  }

  for (const link of extractLinks(content.body)) {
    const url = link.url.toLowerCase();
    if (url.startsWith("http://")) {
      add("body", `Use https for the link to ${link.url}.`);
    } else if (!url.startsWith("https://") && !url.startsWith("/") && !url.startsWith("#")) {
      add("body", `Link "${link.url}" is not allowed. Use https:// links, site paths (/…) or #anchors.`);
    }
    if (link.image && !link.text.trim()) {
      add("body", `Every image in the body needs alt text (${link.url}).`);
    }
  }

  for (const image of structuredImageBlocks(content.body)) {
    if (typeof image.alt !== "string" || !image.alt.trim()) {
      add("body", "Every image in the body needs alt text.");
    }
    if (typeof image.src !== "string" || !MEDIA_LINK.test(image.src)) {
      add("body", "Article image blocks must use an image from the media library.");
    }
  }

  for (const [field, value] of [
    ["title", content.title],
    ["excerpt", content.excerpt],
    ["body", content.body],
  ] as const) {
    if (PLACEHOLDER.test(value))
      add(field, "Remove placeholder text (such as TODO or lorem ipsum) before publishing.");
  }

  if (content.featuredImageId) {
    if (!context.featuredImageExists) add("featuredImageId", "The featured image no longer exists.");
  } else if (content.featuredImageAlt) {
    add("featuredImageAlt", "Image alt text is set but there is no featured image.");
  }

  if (context.knownMediaIds) {
    const known = context.knownMediaIds;
    if (bodyMediaIds(content.body).some((id) => !known.has(id))) {
      add("body", "An image linked in the body is no longer in the media library.");
    }
  }

  for (const topicId of content.topicIds) {
    if (!context.knownTopicIds.has(topicId)) add("topicIds", "One of the selected topics no longer exists.");
  }

  for (const item of content.products) {
    const status = context.productStatus.get(item.productId);
    if (status !== "active") {
      add(
        "products",
        status
          ? "Every recommended product must be active (details verified) before publishing."
          : "One of the recommended products no longer exists.",
      );
      break;
    }
  }

  return issues;
}
