import { describe, expect, it } from "vitest";
import { seoHealth, type SeoHealthGuide } from "@/lib/content/seo-health";
import { launchConfigProblem } from "@/lib/seo/indexing";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

let next = 0;
function guide(overrides: Partial<SeoHealthGuide> = {}): SeoHealthGuide {
  next += 1;
  return {
    id: `g${next}`,
    slug: `guide-${next}`,
    title: `Topic ${next}`,
    excerpt: "A practical summary that is long enough to serve as a meta description in search results.",
    body: `${words(700)}\n\nSee [our shelf guide](/categories/kitchen/shelves).`,
    closing: "",
    category: "kitchen",
    seoTitle: null,
    seoDescription: null,
    featuredImageId: "img",
    featuredImageAlt: "Drawer with dividers",
    faqCount: 2,
    published: true,
    ...overrides,
  };
}

const messages = (report: { issues: { message: string }[] } | undefined) =>
  report?.issues.map((issue) => issue.message) ?? [];

describe("launch configuration", () => {
  it("allows anything while indexing is off", () => {
    expect(launchConfigProblem({})).toBeNull();
    expect(launchConfigProblem({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBeNull();
  });

  it("refuses to index without the live https address", () => {
    expect(launchConfigProblem({ SITE_INDEXING: "enabled" })).toMatch(/needs NEXT_PUBLIC_SITE_URL/);
    expect(
      launchConfigProblem({ SITE_INDEXING: "enabled", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }),
    ).toMatch(/not http:\/\/localhost:3000/);
    expect(
      launchConfigProblem({ SITE_INDEXING: "enabled", NEXT_PUBLIC_SITE_URL: "https://127.0.0.1" }),
    ).not.toBeNull();
    expect(launchConfigProblem({ SITE_INDEXING: "enabled", NEXT_PUBLIC_SITE_URL: "not a url" })).toMatch(
      /not a valid address/,
    );
  });

  it("accepts a real https address", () => {
    expect(
      launchConfigProblem({ SITE_INDEXING: "enabled", NEXT_PUBLIC_SITE_URL: "https://www.tidynest.in" }),
    ).toBeNull();
  });
});

describe("SEO health checks", () => {
  it("passes a complete guide", () => {
    expect(seoHealth([guide()])[0]?.issues).toEqual([]);
  });

  it("flags missing images and alt text", () => {
    const [noImage, noAlt, bodyAlt] = seoHealth([
      guide({ featuredImageId: null, featuredImageAlt: null }),
      guide({ featuredImageAlt: "  " }),
      guide({ body: `${words(700)}\n\n![](/media/x/a.jpg)\n\n[Shelves](/categories/kitchen/shelves)` }),
    ]);
    expect(messages(noImage)).toContain(
      "No featured image. Shares and Google Images fall back to a generated title card.",
    );
    expect(messages(noAlt)).toContain("The featured image has no alt text.");
    expect(messages(bodyAlt)).toContain("1 image in the article without alt text.");
  });

  it("flags long search titles and bad meta description lengths", () => {
    const [longTitle, shortDescription] = seoHealth([
      guide({ title: "A very long title about organising every single drawer in a small Indian kitchen" }),
      guide({ seoDescription: "Too short." }),
    ]);
    expect(messages(longTitle)[0]).toMatch(/Search title is \d+ characters.*by adding a shorter SEO title/);
    expect(messages(shortDescription)).toContain("Meta description is 10 characters. Aim for 70–160.");
  });

  it("flags duplicate titles and descriptions across guides", () => {
    const description = "The same description used on two guides, long enough to pass the length check.";
    const [a, b] = seoHealth([
      guide({ title: "Spice drawer basics", seoDescription: description }),
      guide({ title: "Spice Drawer  Basics", seoDescription: description }),
    ]);
    expect(messages(a)).toContain(
      "Same search title as “Spice Drawer  Basics”. Each guide needs its own title.",
    );
    expect(messages(b)).toContain("Same meta description as “Spice drawer basics”.");
  });

  it("suggests more depth, internal links and FAQs", () => {
    const [thin] = seoHealth([guide({ body: words(200), faqCount: 0 })]);
    expect(thin?.issues.every((issue) => issue.level === "improve")).toBe(true);
    expect(messages(thin)).toEqual([
      "Only 200 words. Guides under 600 rarely cover a search fully.",
      "No links to other TidyNest pages in the article text.",
      "No FAQs. Questions readers search for help the guide appear in more results.",
    ]);
  });

  it("does not count image links or media files as internal links", () => {
    const [report] = seoHealth([
      guide({ body: `${words(700)}\n\n![Shelf](/media/x/a.jpg)\n\n[Download](/media/x/b.pdf)` }),
    ]);
    expect(messages(report)).toContain("No links to other TidyNest pages in the article text.");
  });

  it("flags guides whose titles target the same search", () => {
    const [a, b, c] = seoHealth([
      guide({ title: "Wardrobe organisation for rented flats" }),
      guide({ title: "Rented flat wardrobe organisation" }),
      guide({ title: "Bathroom hooks without drilling" }),
    ]);
    expect(messages(a)).toContain(
      "Title overlaps with “Rented flat wardrobe organisation”. Make sure the two guides answer different searches.",
    );
    expect(messages(b).some((message) => message.startsWith("Title overlaps"))).toBe(true);
    expect(messages(c).some((message) => message.startsWith("Title overlaps"))).toBe(false);
  });

  it("ignores words shared by most of the site's titles", () => {
    const titles = [
      "Decluttering ideas for small Indian apartments",
      "Dining area ideas for small Indian apartments",
      "Entryway storage ideas for small Indian apartments",
      "Books and decor ideas for small Indian apartments",
      "Balcony garden in small Indian apartments",
      "Kitchen pantry for small Indian apartments",
      "Bathroom shelves in small Indian apartments",
      "Kids' toys in small Indian apartments",
    ];
    const reports = seoHealth(titles.map((title) => guide({ title })));
    for (const report of reports) {
      expect(messages(report).some((message) => message.startsWith("Title overlaps"))).toBe(false);
    }
  });
});
