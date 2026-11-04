import { describe, expect, it } from "vitest";
import {
  HOMEPAGE_DEFAULTS,
  homepageContentSchema,
  homepageInputFromForm,
  homepageMediaIds,
} from "@/lib/content/homepage-schema";

describe("homepage content", () => {
  it("accepts the built-in copy", () => {
    const parsed = homepageContentSchema.parse(HOMEPAGE_DEFAULTS);
    expect(parsed.brand.name).toBe("TidyNest");
    expect(parsed.categories.map((category) => category.slug)).toEqual([
      "kitchen",
      "bathroom",
      "bedroom-wardrobe",
      "small-apartments",
      "renters",
    ]);
    expect(homepageMediaIds(parsed)).toEqual([]);
  });

  it("rejects a button that leaves the site", () => {
    const result = homepageContentSchema.safeParse({
      ...HOMEPAGE_DEFAULTS,
      hero: { ...HOMEPAGE_DEFAULTS.hero, ctaHref: "https://example.com" },
    });
    expect(result.success).toBe(false);
  });

  it("reads category lines and an empty logo from the form", () => {
    const form = new FormData();
    form.set("name", HOMEPAGE_DEFAULTS.brand.name);
    form.set("tagline", HOMEPAGE_DEFAULTS.brand.tagline);
    form.set("description", HOMEPAGE_DEFAULTS.brand.description);
    form.set("logoMediaId", "");
    form.set("heroEyebrow", HOMEPAGE_DEFAULTS.hero.eyebrow);
    form.set("heroTitle", "A quieter kitchen,");
    form.set("heroEmphasis", HOMEPAGE_DEFAULTS.hero.emphasis);
    form.set("heroCtaLabel", HOMEPAGE_DEFAULTS.hero.ctaLabel);
    form.set("heroCtaHref", HOMEPAGE_DEFAULTS.hero.ctaHref);
    form.set("heroImageMediaId", "");
    form.set("roomsEyebrow", HOMEPAGE_DEFAULTS.rooms.eyebrow);
    form.set("roomsTitle", HOMEPAGE_DEFAULTS.rooms.title);
    form.set("roomsLead", HOMEPAGE_DEFAULTS.rooms.lead);
    form.set("roomsCardLinkLabel", HOMEPAGE_DEFAULTS.rooms.cardLinkLabel);
    form.set("latestEyebrow", HOMEPAGE_DEFAULTS.latest.eyebrow);
    form.set("latestTitle", HOMEPAGE_DEFAULTS.latest.title);
    form.set("latestLinkLabel", HOMEPAGE_DEFAULTS.latest.linkLabel);
    form.set("latestEmptyTitle", HOMEPAGE_DEFAULTS.latest.emptyTitle);
    form.set("latestEmptyBody", HOMEPAGE_DEFAULTS.latest.emptyBody);
    form.set("principlesEyebrow", HOMEPAGE_DEFAULTS.principles.eyebrow);
    form.set("principlesTitle", HOMEPAGE_DEFAULTS.principles.title);
    HOMEPAGE_DEFAULTS.principles.items.forEach((item, index) => {
      form.set(`principleTitle.${index}`, item.title);
      form.set(`principleBody.${index}`, item.body);
    });
    form.set("footerNote", HOMEPAGE_DEFAULTS.footerNote);
    for (const category of HOMEPAGE_DEFAULTS.categories) {
      form.set(`category.${category.slug}.name`, category.name);
      form.set(`category.${category.slug}.navLabel`, category.navLabel);
      form.set(`category.${category.slug}.description`, category.description);
      form.set(`category.${category.slug}.intro`, category.intro);
      form.set(`category.${category.slug}.covers`, category.covers.join("\n"));
      form.set(`category.${category.slug}.imageMediaId`, "");
    }
    const parsed = homepageContentSchema.parse(homepageInputFromForm(form));
    expect(parsed.hero.title).toBe("A quieter kitchen,");
    expect(parsed.brand.logoMediaId).toBeNull();
    expect(parsed.categories[0]?.covers[0]).toBe(HOMEPAGE_DEFAULTS.categories[0]?.covers[0]);
  });
});
