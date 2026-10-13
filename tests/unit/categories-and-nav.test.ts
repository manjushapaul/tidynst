import { describe, expect, it } from "vitest";
import { CATEGORY_SLUGS, categories, categoryPath, getCategory, isCategorySlug } from "@/content/categories";
import { isActivePath, primaryNav } from "@/components/site/navigation";

describe("categories", () => {
  it("has exactly the five primary categories, in order", () => {
    expect(categories.map((c) => c.slug)).toEqual([
      "kitchen",
      "bathroom",
      "bedroom-wardrobe",
      "small-apartments",
      "renters",
    ]);
    expect(CATEGORY_SLUGS).toHaveLength(5);
  });

  it("does not turn topics into categories", () => {
    for (const topic of ["no-drill", "renter-friendly", "budget", "space-saving"]) {
      expect(isCategorySlug(topic)).toBe(false);
    }
  });

  it("has unique names and meta descriptions within search-friendly length", () => {
    expect(new Set(categories.map((c) => c.name)).size).toBe(5);
    expect(new Set(categories.map((c) => c.description)).size).toBe(5);
    for (const category of categories) {
      expect(category.description.length).toBeGreaterThanOrEqual(70);
      expect(category.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("looks categories up by slug", () => {
    expect(getCategory("kitchen")?.name).toBe("Kitchen");
    expect(getCategory("garage")).toBeUndefined();
    expect(categoryPath("renters")).toBe("/categories/renters");
  });
});

describe("navigation", () => {
  it("links every category from the primary navigation", () => {
    const hrefs = primaryNav.map((item) => item.href);
    for (const slug of CATEGORY_SLUGS) expect(hrefs).toContain(`/categories/${slug}`);
  });

  it("matches active paths on segment boundaries only", () => {
    expect(isActivePath("/guides", "/guides")).toBe(true);
    expect(isActivePath("/guides/abc", "/guides")).toBe(true);
    expect(isActivePath("/guidesx", "/guides")).toBe(false);
  });
});
