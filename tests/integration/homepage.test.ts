import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaAssets } from "@/db/schema";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { HomepageFormError, getPublicHomepage, saveHomepage } from "@/server/homepage";
import { isPublishedMedia } from "@/server/media-access";
import { deleteMedia } from "@/server/media";
import { HOMEPAGE_DEFAULTS, homepageContentSchema } from "@/lib/content/homepage-schema";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;

function actor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return user;
}

function formWith(changes: { heroTitle?: string; logoMediaId?: string }) {
  const content = homepageContentSchema.parse({
    ...HOMEPAGE_DEFAULTS,
    brand: { ...HOMEPAGE_DEFAULTS.brand, logoMediaId: changes.logoMediaId ?? null },
    hero: { ...HOMEPAGE_DEFAULTS.hero, title: changes.heroTitle ?? HOMEPAGE_DEFAULTS.hero.title },
  });
  const form = new FormData();
  form.set("name", content.brand.name);
  form.set("tagline", content.brand.tagline);
  form.set("description", content.brand.description);
  form.set("logoMediaId", content.brand.logoMediaId ?? "");
  form.set("heroEyebrow", content.hero.eyebrow);
  form.set("heroTitle", content.hero.title);
  form.set("heroEmphasis", content.hero.emphasis);
  form.set("heroCtaLabel", content.hero.ctaLabel);
  form.set("heroCtaHref", content.hero.ctaHref);
  form.set("heroImageMediaId", "");
  form.set("roomsEyebrow", content.rooms.eyebrow);
  form.set("roomsTitle", content.rooms.title);
  form.set("roomsLead", content.rooms.lead);
  form.set("roomsCardLinkLabel", content.rooms.cardLinkLabel);
  form.set("latestEyebrow", content.latest.eyebrow);
  form.set("latestTitle", content.latest.title);
  form.set("latestLinkLabel", content.latest.linkLabel);
  form.set("latestEmptyTitle", content.latest.emptyTitle);
  form.set("latestEmptyBody", content.latest.emptyBody);
  form.set("principlesEyebrow", content.principles.eyebrow);
  form.set("principlesTitle", content.principles.title);
  content.principles.items.forEach((item, index) => {
    form.set(`principleTitle.${index}`, item.title);
    form.set(`principleBody.${index}`, item.body);
  });
  form.set("footerNote", content.footerNote);
  for (const category of content.categories) {
    form.set(`category.${category.slug}.name`, category.name);
    form.set(`category.${category.slug}.navLabel`, category.navLabel);
    form.set(`category.${category.slug}.description`, category.description);
    form.set(`category.${category.slug}.intro`, category.intro);
    form.set(`category.${category.slug}.covers`, category.covers.join("\n"));
    form.set(`category.${category.slug}.imageMediaId`, "");
  }
  return form;
}

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe("homepage settings", () => {
  it("uses the built-in copy until an editor saves, then publishes that copy", async () => {
    const owner = actor(await insertUser(t.db, "owner"));
    const author = actor(await insertUser(t.db, "author"));
    const before = await getPublicHomepage(t.db);
    expect(before.name).toBe("TidyNest");
    expect(before.logo).toBeNull();

    await expect(saveHomepage(t.db, author, formWith({ heroTitle: "Nope," }))).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    const [logo] = await t.db
      .insert(mediaAssets)
      .values({
        filename: "logo.webp",
        contentType: "image/webp",
        byteSize: 80,
        width: 64,
        height: 64,
        sha256: "homepage-logo-sha",
        data: Buffer.from("logo"),
        altText: "TidyNest leaf mark",
        uploadedBy: owner.id,
      })
      .returning();

    await saveHomepage(t.db, owner, formWith({ heroTitle: "A quieter kitchen,", logoMediaId: logo!.id }));
    const after = await getPublicHomepage(t.db);
    expect(after.hero.title).toBe("A quieter kitchen,");
    expect(after.logo).toMatchObject({ alt: "TidyNest leaf mark", src: `/media/${logo!.id}/logo.webp` });
    expect(await isPublishedMedia(t.db, logo!.id)).toBe(true);
    await expect(deleteMedia(t.db, owner, logo!.id)).rejects.toThrow(/homepage/);

    const bad = formWith({});
    bad.set("heroCtaHref", "https://example.com");
    await expect(saveHomepage(t.db, owner, bad)).rejects.toBeInstanceOf(HomepageFormError);
  });
});
