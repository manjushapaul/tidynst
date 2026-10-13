import { describe, expect, it } from "vitest";
import { guideContentHash } from "@/lib/content/content-hash";
import { guideContentSchema } from "@/lib/content/guide-schema";
import { countWords, extractHeadings, extractLinks } from "@/lib/content/markdown";
import { publishIssues, type PublishContext } from "@/lib/content/publish-rules";
import { isValidSlug, slugify } from "@/lib/content/slug";
import { guideContent } from "../support/fixtures";

const context: PublishContext = {
  productStatus: new Map(),
  knownTopicIds: new Set(),
  featuredImageExists: false,
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("slugs", () => {
  it("slugifies titles into lowercase hyphenated ASCII", () => {
    expect(slugify("  Best No-Drill Shelves for Tiles & Glass! ")).toBe(
      "best-no-drill-shelves-for-tiles-and-glass",
    );
    expect(slugify("Crème brûlée café")).toBe("creme-brulee-cafe");
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it("validates slugs", () => {
    expect(isValidSlug("kitchen-storage-101")).toBe(true);
    for (const bad of ["", "Kitchen", "a--b", "-a", "a-", "a b", "a_b"]) expect(isValidSlug(bad)).toBe(false);
  });
});

describe("guide content schema", () => {
  it("normalises empty optional fields to null and CRLF line endings", () => {
    const parsed = guideContentSchema.parse({ ...guideContent(), seoTitle: "  ", body: "a\r\nb\r\n" });
    expect(parsed.seoTitle).toBeNull();
    expect(parsed.body).toBe("a\nb");
  });

  it("rejects unknown fields, invalid categories and duplicates", () => {
    expect(guideContentSchema.safeParse({ ...guideContent(), status: "published" }).success).toBe(false);
    expect(guideContentSchema.safeParse({ ...guideContent(), category: "no-drill" }).success).toBe(false);
    expect(guideContentSchema.safeParse({ ...guideContent(), topicIds: [uuid(1), uuid(1)] }).success).toBe(
      false,
    );
  });
});

describe("content hash", () => {
  it("ignores topic order but not product order", () => {
    const a = guideContent({ topicIds: [uuid(1), uuid(2)] });
    const b = guideContent({ topicIds: [uuid(2), uuid(1)] });
    expect(guideContentHash(a)).toBe(guideContentHash(b));

    const p1 = { productId: uuid(3), note: null };
    const p2 = { productId: uuid(4), note: null };
    expect(guideContentHash(guideContent({ products: [p1, p2] }))).not.toBe(
      guideContentHash(guideContent({ products: [p2, p1] })),
    );
  });

  it("changes when any material field changes", () => {
    const base = guideContentHash(guideContent());
    const changes: Array<Partial<ReturnType<typeof guideContent>>> = [
      { title: "Another title for the guide" },
      { slug: "another-slug" },
      { excerpt: "Different" },
      { body: "Different" },
      { category: "bathroom" },
      { seoTitle: "SEO" },
      { seoDescription: "Meta" },
      { featuredImageAlt: "Alt" },
    ];
    for (const change of changes) expect(guideContentHash(guideContent(change))).not.toBe(base);
  });
});

describe("markdown helpers", () => {
  it("extracts headings with rehype-slug compatible ids, ignoring code fences", () => {
    const md = "## Spice racks & jars\n\n```\n## not a heading\n```\n\n### Spice racks & jars";
    expect(extractHeadings(md)).toEqual([
      { depth: 2, text: "Spice racks & jars", id: "spice-racks--jars" },
      { depth: 3, text: "Spice racks & jars", id: "spice-racks--jars-1" },
    ]);
  });

  it("counts words and finds links", () => {
    expect(countWords("## Title\n\nOne two [three](https://x.test) four.")).toBe(5);
    expect(extractLinks("See [a](https://a.test) and ![b](/media/x.png).")).toEqual([
      { image: false, text: "a", url: "https://a.test" },
      { image: true, text: "b", url: "/media/x.png" },
    ]);
  });
});

describe("publish rules", () => {
  it("accepts a complete guide", () => {
    expect(publishIssues(guideContent(), context)).toEqual([]);
  });

  it("requires a category, summary length and enough words", () => {
    const issues = publishIssues(
      guideContent({ category: null, excerpt: "Too short", body: "Short body." }),
      context,
    );
    const fields = issues.map((issue) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(["category", "excerpt", "body"]));
  });

  it("rejects H1 headings, skipped heading levels, insecure links and placeholders", () => {
    const body = guideContent().body;
    const cases = [
      `# Second title\n\n${body}`,
      `${body}\n\n#### Deep heading`,
      `${body}\n\n[link](http://example.com)`,
      `${body}\n\n[link](javascript:alert(1))`,
      `${body}\n\nTODO: finish this`,
    ];
    for (const caseBody of cases) {
      expect(publishIssues(guideContent({ body: caseBody }), context).length).toBeGreaterThan(0);
    }
  });

  it("requires recommended products to be active", () => {
    const content = guideContent({ products: [{ productId: uuid(9), note: null }] });
    expect(publishIssues(content, { ...context, productStatus: new Map([[uuid(9), "draft"]]) })).toHaveLength(
      1,
    );
    expect(publishIssues(content, { ...context, productStatus: new Map([[uuid(9), "active"]]) })).toEqual([]);
    expect(publishIssues(content, context)[0]?.message).toMatch(/no longer exists/);
  });

  it("requires a valid meta description when the summary is too long to use", () => {
    const excerpt = "A".repeat(200);
    const issues = publishIssues(guideContent({ excerpt }), context);
    expect(issues.map((issue) => issue.field)).toContain("seoDescription");
    expect(publishIssues(guideContent({ excerpt, seoDescription: "B".repeat(120) }), context)).toEqual([]);
  });
});
