import "server-only";
import { eq, inArray } from "drizzle-orm";
import { homepageSettings, mediaAssets } from "@/db/schema";
import type { Db } from "@/db/types";
import { isCategorySlug, type CategorySlug } from "@/content/categories";
import {
  HOMEPAGE_DEFAULTS,
  HOMEPAGE_ID,
  HOMEPAGE_LIMITS,
  homepageContentSchema,
  homepageFieldErrors,
  homepageInputFromForm,
  homepageMediaIds,
  type HomepageContent,
} from "@/lib/content/homepage-schema";
import { mediaPath, type PublicImage } from "@/server/public-content";
import { assertCan, type Actor } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { UserInputError } from "@/server/users";

export class HomepageFormError extends Error {
  override name = "HomepageFormError";
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export type PublicCategory = HomepageContent["categories"][number] & { image: PublicImage | null };

export type PublicHomepage = {
  name: string;
  tagline: string;
  description: string;
  logo: PublicImage | null;
  footerNote: string;
  hero: Omit<HomepageContent["hero"], "imageMediaId"> & { image: PublicImage | null };
  rooms: HomepageContent["rooms"];
  latest: HomepageContent["latest"];
  principles: HomepageContent["principles"];
  categories: PublicCategory[];
};

/** Saved homepage, or the built-in copy when nobody has saved one yet. */
export async function getHomepageContent(db: Db): Promise<HomepageContent> {
  const [row] = await db
    .select({ content: homepageSettings.content })
    .from(homepageSettings)
    .where(eq(homepageSettings.id, HOMEPAGE_ID))
    .limit(1);
  if (!row) return HOMEPAGE_DEFAULTS;
  const parsed = homepageContentSchema.safeParse(row.content);
  if (!parsed.success) {
    console.error("Homepage content failed validation and was ignored.");
    return HOMEPAGE_DEFAULTS;
  }
  return parsed.data;
}

export async function getPublicHomepage(db: Db): Promise<PublicHomepage> {
  const content = await getHomepageContent(db);
  const ids = homepageMediaIds(content);
  const rows = ids.length
    ? await db
        .select({
          id: mediaAssets.id,
          filename: mediaAssets.filename,
          width: mediaAssets.width,
          height: mediaAssets.height,
          altText: mediaAssets.altText,
        })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, ids))
    : [];
  const images = new Map(
    rows.map((row) => [
      row.id,
      {
        src: mediaPath(row.id, row.filename),
        width: row.width,
        height: row.height,
        alt: row.altText,
      } satisfies PublicImage,
    ]),
  );
  const image = (id: string | null) => (id ? (images.get(id) ?? null) : null);
  return {
    name: content.brand.name,
    tagline: content.brand.tagline,
    description: content.brand.description,
    logo: image(content.brand.logoMediaId),
    footerNote: content.footerNote,
    hero: {
      eyebrow: content.hero.eyebrow,
      title: content.hero.title,
      emphasis: content.hero.emphasis,
      ctaLabel: content.hero.ctaLabel,
      ctaHref: content.hero.ctaHref,
      image: image(content.hero.imageMediaId),
    },
    rooms: content.rooms,
    latest: content.latest,
    principles: content.principles,
    categories: content.categories.map((category) => {
      const { imageMediaId, ...rest } = category;
      return { ...rest, imageMediaId, image: image(imageMediaId) };
    }),
  };
}

export function publicCategory(home: PublicHomepage, slug: CategorySlug): PublicCategory | undefined {
  return home.categories.find((category) => category.slug === slug);
}

async function persistHomepage(db: Db, actor: Actor, content: HomepageContent): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(homepageSettings)
      .values({ id: HOMEPAGE_ID, content, updatedBy: actor.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: homepageSettings.id,
        set: { content, updatedBy: actor.id, updatedAt: new Date() },
      });
    await audit(tx, {
      actorId: actor.id,
      action: "site.updated",
      entityType: "site",
      entityId: HOMEPAGE_ID,
      details: { name: content.brand.name },
    });
  });
}

/** The paragraph under a main category name, edited from the Categories screen. */
export async function updateCategoryIntro(
  db: Db,
  actor: Actor,
  category: string,
  intro: string,
): Promise<void> {
  assertCan(actor, "site.manage");
  if (!isCategorySlug(category)) throw new UserInputError("Category not found.");
  const current = await getHomepageContent(db);
  const next = {
    ...current,
    categories: current.categories.map((item) =>
      item.slug === category ? { ...item, intro: intro.trim() } : item,
    ),
  };
  const parsed = homepageContentSchema.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((item) => item.path.at(-1) === "intro");
    const message =
      issue?.message ??
      `Description must be between 40 and ${HOMEPAGE_LIMITS.introMax} characters.`;
    throw new HomepageFormError(message, { intro: message });
  }
  await persistHomepage(db, actor, parsed.data);
}

/** Owners and editors replace the public homepage. Category addresses do not change. */
export async function saveHomepage(db: Db, actor: Actor, form: FormData): Promise<HomepageContent> {
  assertCan(actor, "site.manage");
  const parsed = homepageContentSchema.safeParse(homepageInputFromForm(form));
  if (!parsed.success) {
    throw new HomepageFormError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      homepageFieldErrors(parsed.error),
    );
  }
  const content = parsed.data;
  const ids = homepageMediaIds(content);
  if (ids.length > 0) {
    const found = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, ids));
    if (found.length !== ids.length) {
      throw new HomepageFormError("One of the chosen images is no longer in the library. Choose it again.");
    }
  }

  await persistHomepage(db, actor, content);
  return content;
}
