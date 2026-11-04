import type { CategorySlug } from "@/content/categories";
import { countWords, extractLinks } from "./markdown";
import { PUBLISH_RULES } from "./publish-rules";

export const SEO_HEALTH_RULES = {
  /** Below this a guide is unlikely to cover a search fully. */
  minWords: 600,
  /** Google shows roughly this many characters of a title before cutting it off. */
  searchTitleMax: 60,
  metaDescriptionMin: PUBLISH_RULES.metaDescriptionMin,
  metaDescriptionMax: PUBLISH_RULES.metaDescriptionMax,
  /** Published guides a category needs before its hub page looks substantial. */
  categoryTarget: 4,
  /** Share of distinctive title words two guides have in common before they are flagged. */
  overlapThreshold: 0.6,
} as const;

export type SeoHealthGuide = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  closing: string;
  category: CategorySlug | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageId: string | null;
  /** The guide's own alt text, falling back to the media library's. */
  featuredImageAlt: string | null;
  faqCount: number;
  published: boolean;
};

/** `fix` hurts how the guide is found or shown; `improve` is worth doing but not urgent. */
export type SeoIssue = { level: "fix" | "improve"; message: string };

export type SeoGuideReport = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  words: number;
  issues: SeoIssue[];
};

const STOPWORDS = new Set(
  "the and for with your you how what why when where which that this from into onto are can its our out use using tips guide ideas ways best".split(
    " ",
  ),
);

function titleWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map((word) =>
      word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    );
  return new Set(words);
}

const normalise = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

function searchTitle(guide: SeoHealthGuide): string {
  return guide.seoTitle?.trim() || guide.title.trim();
}

function metaDescription(guide: SeoHealthGuide): string {
  return guide.seoDescription?.trim() || guide.excerpt.trim();
}

/**
 * Words that say what a title is about. Words used across a large share of the site's titles
 * (such as "small" or "apartment" on a small-apartment site) say little, so they are left out.
 */
function distinctiveWords(guides: readonly SeoHealthGuide[]): Map<string, Set<string>> {
  const words = new Map(guides.map((guide) => [guide.id, titleWords(searchTitle(guide))]));
  if (guides.length >= 8) {
    const frequency = new Map<string, number>();
    for (const set of words.values())
      for (const word of set) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    for (const set of words.values()) {
      for (const word of set) if ((frequency.get(word) ?? 0) > guides.length / 4) set.delete(word);
    }
  }
  return words;
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): { shared: number; ratio: number } {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return { shared, ratio: union === 0 ? 0 : shared / union };
}

export function seoHealth(guides: readonly SeoHealthGuide[]): SeoGuideReport[] {
  const byTitle = new Map<string, SeoHealthGuide[]>();
  const byDescription = new Map<string, SeoHealthGuide[]>();
  for (const guide of guides) {
    const title = normalise(searchTitle(guide));
    byTitle.set(title, [...(byTitle.get(title) ?? []), guide]);
    const description = normalise(metaDescription(guide));
    if (description) byDescription.set(description, [...(byDescription.get(description) ?? []), guide]);
  }
  const words = distinctiveWords(guides);

  return guides.map((guide) => {
    const issues: SeoIssue[] = [];
    const fix = (message: string) => issues.push({ level: "fix", message });
    const improve = (message: string) => issues.push({ level: "improve", message });
    const markdown = `${guide.body}\n\n${guide.closing}`;
    const links = extractLinks(markdown);
    const wordCount = countWords(markdown);

    if (!guide.category) fix("No category, so the guide is not listed on any category page.");

    const title = searchTitle(guide);
    if (title.length > SEO_HEALTH_RULES.searchTitleMax) {
      fix(
        `Search title is ${title.length} characters and may be cut off in Google. Keep it under ${SEO_HEALTH_RULES.searchTitleMax}${guide.seoTitle ? "" : " by adding a shorter SEO title"}.`,
      );
    }
    const duplicateTitles = (byTitle.get(normalise(title)) ?? []).filter((other) => other.id !== guide.id);
    if (duplicateTitles.length) {
      fix(`Same search title as “${duplicateTitles[0]!.title}”. Each guide needs its own title.`);
    }

    const description = metaDescription(guide);
    if (
      description.length < SEO_HEALTH_RULES.metaDescriptionMin ||
      description.length > SEO_HEALTH_RULES.metaDescriptionMax
    ) {
      fix(
        `Meta description is ${description.length} characters. Aim for ${SEO_HEALTH_RULES.metaDescriptionMin}–${SEO_HEALTH_RULES.metaDescriptionMax}.`,
      );
    }
    const duplicateDescriptions = description
      ? (byDescription.get(normalise(description)) ?? []).filter((other) => other.id !== guide.id)
      : [];
    if (duplicateDescriptions.length) {
      fix(`Same meta description as “${duplicateDescriptions[0]!.title}”.`);
    }

    if (!guide.featuredImageId) {
      fix("No featured image. Shares and Google Images fall back to a generated title card.");
    } else if (!guide.featuredImageAlt?.trim()) {
      fix("The featured image has no alt text.");
    }
    const imagesWithoutAlt = links.filter((link) => link.image && !link.text.trim()).length;
    if (imagesWithoutAlt) {
      fix(`${imagesWithoutAlt} image${imagesWithoutAlt === 1 ? "" : "s"} in the article without alt text.`);
    }

    if (wordCount < SEO_HEALTH_RULES.minWords) {
      improve(
        `Only ${wordCount} words. Guides under ${SEO_HEALTH_RULES.minWords} rarely cover a search fully.`,
      );
    }
    const internalLinks = links.filter(
      (link) => !link.image && link.url.startsWith("/") && !link.url.startsWith("/media/"),
    ).length;
    if (internalLinks === 0) improve("No links to other TidyNest pages in the article text.");
    if (guide.faqCount === 0)
      improve("No FAQs. Questions readers search for help the guide appear in more results.");

    const mine = words.get(guide.id)!;
    for (const other of guides) {
      if (other.id === guide.id || duplicateTitles.includes(other)) continue;
      const { shared, ratio } = overlap(mine, words.get(other.id)!);
      if (shared >= 2 && ratio >= SEO_HEALTH_RULES.overlapThreshold) {
        improve(`Title overlaps with “${other.title}”. Make sure the two guides answer different searches.`);
        break;
      }
    }

    return {
      id: guide.id,
      slug: guide.slug,
      title: guide.title,
      published: guide.published,
      words: wordCount,
      issues,
    };
  });
}
