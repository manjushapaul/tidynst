import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideDocument } from "@/components/content/guide-document";
import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import { productUrlProblem } from "@/lib/content/product-schema";
import { publishIssues } from "@/lib/content/publish-rules";
import {
  CONTENT_CHECKS_ISSUES,
  CONTENT_CHECKS_LABEL,
  CONTENT_CHECKS_PASSED,
  REVIEW_LABELS,
  REVIEW_STATUS_LABEL,
} from "@/lib/content/guide-status";
import { affiliateLinksEnabled } from "@/lib/affiliate";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { pageMetadata } from "@/lib/seo/metadata";
import { buildSitemap } from "@/lib/seo/sitemap";
import { articleJsonLd } from "@/lib/seo/structured-data";
import { guideContent } from "../support/fixtures";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** Internal acronym that must not be added to reader-facing copy or search metadata. */
const READER_QA = /\bQA\b|Quality Assurance|QA Approved|QA Complete|QA-Approved/i;

const PUBLIC_DIRS = [
  "src/app/(site)",
  "src/components/site",
  "src/components/content",
  "src/components/seo",
  "src/lib/seo",
  "src/content",
];

function sourceFiles(dir: string): string[] {
  const absolute = join(root, dir);
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(relative(root, path)));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public language", () => {
  it("does not put QA terminology in public page or SEO source", () => {
    const files = [...PUBLIC_DIRS.flatMap(sourceFiles), join(root, "src/lib/site.ts")];
    const hits = files.filter((file) => READER_QA.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("renders an article without workflow status or QA labels", () => {
    const title = "Spice storage for a compact kitchen";
    const html = renderToStaticMarkup(
      createElement(GuideDocument, {
        guide: {
          slug: "spice-storage-for-a-compact-kitchen",
          title,
          excerpt:
            "How to keep masalas within reach in a small Indian kitchen without crowding the platform.",
          body: "## Start with the dabba\n\nKeep daily spices close.\n\n## Store the rest\n\nUse one shelf.",
          closing: "",
          category: "kitchen",
          seoTitle: null,
          seoDescription: null,
          readingMinutes: 4,
          updatedAt: new Date("2026-10-13T00:00:00.000Z"),
          firstPublishedAt: new Date("2026-10-01T00:00:00.000Z"),
          image: null,
          topics: [],
          products: [],
          faqs: [],
          articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
          featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
        },
      }),
    );
    expect(html).toContain(`<h1`);
    expect(html).toContain(title);
    expect(html).toContain("/categories/kitchen/spice-storage-for-a-compact-kitchen");
    expect(html).not.toMatch(READER_QA);
    expect(html).not.toContain(REVIEW_STATUS_LABEL);
    expect(html).not.toContain(CONTENT_CHECKS_LABEL);
    expect(html).not.toContain(REVIEW_LABELS.approved);
  });

  it("shows the category's subcategory buttons in the topics row", () => {
    const html = renderToStaticMarkup(
      createElement(GuideDocument, {
        guide: {
          slug: "living-room-storage",
          title: "Living room storage for a small apartment",
          excerpt: "How to keep a living room clear when it also works as a dining space.",
          body: "## Start with the floor\n\nLeave a path through the room.\n\n## Use the wall\n\nShelves above the sofa.",
          closing: "",
          category: "small-apartments",
          seoTitle: null,
          seoDescription: null,
          readingMinutes: 4,
          updatedAt: new Date("2026-10-13T00:00:00.000Z"),
          firstPublishedAt: new Date("2026-10-01T00:00:00.000Z"),
          image: null,
          topics: [{ id: "budget", slug: "budget", name: "Budget", description: "Spend less." }],
          products: [],
          faqs: [],
          articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
          featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
        },
        topics: [
          { id: "living", name: "Living Room", href: "/categories/small-apartments/living-room" },
          { id: "entry", name: "Entryway & Utility", href: "/categories/small-apartments/entryway-utility" },
        ],
      }),
    );
    expect(html).toContain("Living Room");
    expect(html).toContain("/categories/small-apartments/living-room");
    expect(html).toContain("Entryway &amp; Utility");
    expect(html).not.toContain("/topics/budget");
    expect(html).not.toContain(">Budget<");
  });
});

describe("article metadata", () => {
  const title = "Spice storage for a compact kitchen";
  const description = "How to keep masalas within reach in a small Indian kitchen.";
  const path = "/categories/kitchen/spice-storage-for-a-compact-kitchen";

  it("keeps the guide address, canonical URL and indexing safeguard, with no QA in metadata", () => {
    vi.stubEnv("SITE_INDEXING", "");
    expect(isIndexingEnabled()).toBe(false);
    const meta = pageMetadata({
      title,
      description,
      path,
      openGraph: { type: "article", publishedTime: "2026-10-01T00:00:00.000Z" },
    });
    expect(meta.alternates?.canonical).toBe(
      "http://localhost:3000/categories/kitchen/spice-storage-for-a-compact-kitchen",
    );
    expect(meta.title).toBe(title);
    expect(meta.description).toBe(description);
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.openGraph).toMatchObject({ title, description, type: "article" });
    expect(JSON.stringify(meta)).not.toMatch(READER_QA);

    const article = articleJsonLd({
      title,
      description,
      path,
      datePublished: new Date("2026-10-01T00:00:00.000Z"),
      dateModified: new Date("2026-10-13T00:00:00.000Z"),
      section: "Kitchen",
    });
    expect(article.headline).toBe(title);
    expect(article.description).toBe(description);
    expect(article.url).toBe("http://localhost:3000/categories/kitchen/spice-storage-for-a-compact-kitchen");
    expect(article).not.toHaveProperty("keywords");
    expect(JSON.stringify(article)).not.toMatch(READER_QA);
    expect(JSON.stringify(article)).not.toMatch(/aggregateRating|review/i);

    expect(buildSitemap({ indexingEnabled: false, guides: [], categories: [], topics: [] })).toEqual([]);
  });
});

describe("CMS labels", () => {
  it("uses editor language and keeps approval distinct from content checks", () => {
    expect(REVIEW_STATUS_LABEL).toBe("Review status");
    expect(CONTENT_CHECKS_LABEL).toBe("Content checks");
    expect(CONTENT_CHECKS_PASSED).toBe("Checks passed.");
    expect(CONTENT_CHECKS_ISSUES).toBe("Issues found.");
    expect(REVIEW_LABELS).toEqual({
      not_requested: "Not submitted",
      in_review: "In review",
      changes_requested: "Changes requested",
      approved: "Approved",
    });
    expect(Object.values(REVIEW_LABELS).join(" ")).not.toMatch(READER_QA);

    const admin = ["src/app/admin", "src/components/admin"].flatMap(sourceFiles);
    const qaHits = admin.filter((file) => /\bQA\b/.test(readFileSync(file, "utf8")));
    expect(qaHits).toEqual([]);

    const layout = readFileSync(join(root, "src/app/admin/(panel)/layout.tsx"), "utf8");
    const dashboard = readFileSync(join(root, "src/app/admin/(panel)/page.tsx"), "utf8");
    const reviews = readFileSync(join(root, "src/app/admin/(panel)/reviews/page.tsx"), "utf8");
    const editor = readFileSync(join(root, "src/components/admin/guide-editor.tsx"), "utf8");
    expect(layout).toContain('label: "Content review"');
    expect(layout).toContain('href: "/admin/reviews"');
    expect(dashboard).toContain('title="Content review"');
    expect(reviews).toContain('title: "Content review"');
    expect(reviews).toContain('title="Content review"');
    expect(editor).toContain("CONTENT_CHECKS_LABEL");
    expect(editor).toContain("CONTENT_CHECKS_PASSED");
    expect(editor).toContain("CONTENT_CHECKS_ISSUES");
  });
});

describe("existing safeguards", () => {
  it("still reports publication problems, and those messages do not say QA", () => {
    const issues = publishIssues(
      guideContent({ title: "Too short", excerpt: "Too short to publish as a summary." }),
      { productStatus: new Map(), knownTopicIds: new Set(), featuredImageExists: false },
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((issue) => issue.message).join(" ")).not.toMatch(READER_QA);
  });

  it("keeps affiliate links off and still rejects tracked product URLs", () => {
    vi.stubEnv("AFFILIATE_LINKS_ENABLED", "");
    expect(affiliateLinksEnabled()).toBe(false);
    expect(productUrlProblem("https://www.amazon.in/dp/B0TEST/ref=sr_1_1")).toMatch(/affiliate/i);
    expect(productUrlProblem("https://shop.example.com/item")).toBeNull();
  });
});

describe("local layout seed", () => {
  it("keeps QA as a database target and removes it from copy the public template would show", () => {
    const seed = readFileSync(join(root, "scripts/qa/seed.ts"), "utf8");
    expect(seed).toContain('assertDatabaseTarget(process.env.DATABASE_URL, ["qa"])');
    expect(seed).toContain("qa-owner@example.test");
    for (const phrase of [
      "QA:",
      "Synthetic QA",
      "QA synthetic",
      "QA Brand",
      "used for QA",
      "note for QA",
      "qa-sage-placeholder",
      "qa-synthetic-rack",
      "/qa-rack",
    ]) {
      expect(seed).not.toContain(phrase);
    }
  });
});
