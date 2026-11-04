import { describe, expect, it } from "vitest";
import {
  CATEGORY_SLUGS,
  categories,
  categoryPath,
  getCategory,
  guidePath,
  isCategorySlug,
} from "@/content/categories";
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

  it("places articles under their category, falling back to /guides for uncategorised drafts", () => {
    expect(guidePath({ category: "small-apartments", slug: "test" })).toBe(
      "/categories/small-apartments/test",
    );
    expect(guidePath({ category: null, slug: "draft" })).toBe("/guides/draft");
    expect(isActivePath(guidePath({ category: "kitchen", slug: "a" }), categoryPath("kitchen"))).toBe(true);
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
  it("links exactly the categories from the primary navigation", () => {
    expect(primaryNav.map((item) => item.href)).toEqual(CATEGORY_SLUGS.map((slug) => `/categories/${slug}`));
  });

  it("matches active paths on segment boundaries only", () => {
    expect(isActivePath("/guides", "/guides")).toBe(true);
    expect(isActivePath("/guides/abc", "/guides")).toBe(true);
    expect(isActivePath("/guidesx", "/guides")).toBe(false);
  });
});
