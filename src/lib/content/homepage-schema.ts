import { z } from "zod";
import { CATEGORY_SLUGS, categories, type CategorySlug } from "@/content/categories";
import { site } from "@/lib/site";

export const HOMEPAGE_ID = "site";

export const HOMEPAGE_LIMITS = {
  nameMin: 2,
  nameMax: 40,
  taglineMin: 10,
  taglineMax: 140,
  descriptionMin: 40,
  descriptionMax: 300,
  eyebrowMax: 60,
  titleMax: 80,
  leadMax: 240,
  ctaMax: 40,
  pathMax: 200,
  principleMin: 1,
  principleMax: 6,
  principleBodyMax: 400,
  footerNoteMax: 160,
  categoryNameMax: 40,
  navLabelMax: 24,
  categoryDescriptionMax: 170,
  introMax: 600,
  coversMin: 2,
  coversMax: 6,
  coverMax: 80,
  cardLinkMax: 24,
} as const;

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalMediaId = z.preprocess((value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}, z.uuid("Choose an image from the library.").nullable());

const publicPath = z
  .string()
  .trim()
  .min(1, "Add a page address for the button.")
  .max(HOMEPAGE_LIMITS.pathMax, "That page address is too long.")
  .refine(
    (value) => value === "/" || /^(\/[a-z0-9][a-z0-9_-]*)+$/.test(value),
    "Use a page address on this site, such as /categories/renters.",
  )
  .refine(
    (value) => !/^\/(admin|media|_next|og|page-view)(\/|$)/.test(value),
    "That address is not a public page.",
  );

const categorySchema = z
  .object({
    slug: z.enum(CATEGORY_SLUGS),
    name: text(2, HOMEPAGE_LIMITS.categoryNameMax, "Category name"),
    navLabel: text(2, HOMEPAGE_LIMITS.navLabelMax, "Navigation label"),
    description: text(40, HOMEPAGE_LIMITS.categoryDescriptionMax, "Category description"),
    intro: text(40, HOMEPAGE_LIMITS.introMax, "Category introduction"),
    covers: z
      .array(text(2, HOMEPAGE_LIMITS.coverMax, "Each line"))
      .min(
        HOMEPAGE_LIMITS.coversMin,
        `Add at least ${HOMEPAGE_LIMITS.coversMin} lines for what this category covers.`,
      )
      .max(HOMEPAGE_LIMITS.coversMax, `Use at most ${HOMEPAGE_LIMITS.coversMax} lines.`),
    imageMediaId: optionalMediaId,
  })
  .strict();

export const homepageContentSchema = z
  .object({
    brand: z
      .object({
        name: text(HOMEPAGE_LIMITS.nameMin, HOMEPAGE_LIMITS.nameMax, "Site name"),
        tagline: text(HOMEPAGE_LIMITS.taglineMin, HOMEPAGE_LIMITS.taglineMax, "Tagline"),
        description: text(HOMEPAGE_LIMITS.descriptionMin, HOMEPAGE_LIMITS.descriptionMax, "Description"),
        logoMediaId: optionalMediaId,
      })
      .strict(),
    hero: z
      .object({
        eyebrow: text(2, HOMEPAGE_LIMITS.eyebrowMax, "Hero label"),
        title: text(2, HOMEPAGE_LIMITS.titleMax, "Hero heading"),
        emphasis: text(2, HOMEPAGE_LIMITS.titleMax, "Hero emphasis"),
        ctaLabel: text(2, HOMEPAGE_LIMITS.ctaMax, "Button label"),
        ctaHref: publicPath,
        imageMediaId: optionalMediaId,
      })
      .strict(),
    rooms: z
      .object({
        eyebrow: text(2, HOMEPAGE_LIMITS.eyebrowMax, "Rooms label"),
        title: text(2, HOMEPAGE_LIMITS.titleMax, "Rooms heading"),
        lead: text(2, HOMEPAGE_LIMITS.leadMax, "Rooms introduction"),
        cardLinkLabel: text(2, HOMEPAGE_LIMITS.cardLinkMax, "Card link"),
      })
      .strict(),
    latest: z
      .object({
        eyebrow: text(2, HOMEPAGE_LIMITS.eyebrowMax, "Guides label"),
        title: text(2, HOMEPAGE_LIMITS.titleMax, "Guides heading"),
        linkLabel: text(2, HOMEPAGE_LIMITS.ctaMax, "Guides link"),
        emptyTitle: text(2, HOMEPAGE_LIMITS.titleMax, "Empty heading"),
        emptyBody: text(2, HOMEPAGE_LIMITS.leadMax, "Empty message"),
      })
      .strict(),
    principles: z
      .object({
        eyebrow: text(2, HOMEPAGE_LIMITS.eyebrowMax, "Approach label"),
        title: text(2, HOMEPAGE_LIMITS.titleMax, "Approach heading"),
        items: z
          .array(
            z
              .object({
                title: text(2, HOMEPAGE_LIMITS.titleMax, "Point title"),
                body: text(20, HOMEPAGE_LIMITS.principleBodyMax, "Point text"),
              })
              .strict(),
          )
          .min(HOMEPAGE_LIMITS.principleMin, "Add at least one point.")
          .max(HOMEPAGE_LIMITS.principleMax, `Use at most ${HOMEPAGE_LIMITS.principleMax} points.`),
      })
      .strict(),
    footerNote: text(2, HOMEPAGE_LIMITS.footerNoteMax, "Footer line"),
    categories: z.array(categorySchema).length(CATEGORY_SLUGS.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    const slugs = value.categories.map((category) => category.slug);
    if (new Set(slugs).size !== slugs.length || CATEGORY_SLUGS.some((slug) => !slugs.includes(slug))) {
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Include each of the five categories once.",
      });
    }
  });

export type HomepageContent = z.infer<typeof homepageContentSchema>;

/** The homepage as it reads today, used until an editor saves a change. */
export const HOMEPAGE_DEFAULTS: HomepageContent = {
  brand: {
    name: site.name,
    tagline: site.tagline,
    description: site.description,
    logoMediaId: null,
  },
  hero: {
    eyebrow: "Organising for small homes",
    title: "A calmer home,",
    emphasis: "one corner at a time",
    ctaLabel: "Ideas for renters",
    ctaHref: "/categories/renters",
    imageMediaId: null,
  },
  rooms: {
    eyebrow: "Start with a room",
    title: "Where does your home need help?",
    lead: "Five focused areas, each with guides written for compact Indian homes.",
    cardLinkLabel: "Explore",
  },
  latest: {
    eyebrow: "Fresh from the editors",
    title: "Latest guides",
    linkLabel: "All guides",
    emptyTitle: "Our first guides are on their way",
    emptyBody: "Every guide is written and reviewed before it is published. Check back soon.",
  },
  principles: {
    eyebrow: "Our approach",
    title: "What you can expect from us",
    items: [
      {
        title: "Made for Indian homes",
        body: "Steel almirahs, masala dabbas, wet bathrooms and rented flats — advice that fits how we actually live.",
      },
      {
        title: "Small-space first",
        body: "Every idea is judged by whether it works in a 1BHK or a compact 2BHK, not in a showroom.",
      },
      {
        title: "Honest by default",
        body: "No invented reviews, ratings or prices. We say where information comes from, and we update guides when it changes.",
      },
    ],
  },
  footerNote: "Independent editorial content.",
  categories: categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    navLabel: category.navLabel,
    description: category.description,
    intro: category.intro,
    covers: [...category.covers],
    imageMediaId: null,
  })),
};

export function homepageMediaIds(content: HomepageContent): string[] {
  const ids = [
    content.brand.logoMediaId,
    content.hero.imageMediaId,
    ...content.categories.map((category) => category.imageMediaId),
  ];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Turns the homepage form into the shape the schema checks. */
export function homepageInputFromForm(form: FormData): unknown {
  const principles = [];
  for (let index = 0; index < HOMEPAGE_LIMITS.principleMax; index += 1) {
    const title = field(form, `principleTitle.${index}`);
    const body = field(form, `principleBody.${index}`);
    if (!title.trim() && !body.trim()) continue;
    principles.push({ title, body });
  }
  return {
    brand: {
      name: field(form, "name"),
      tagline: field(form, "tagline"),
      description: field(form, "description"),
      logoMediaId: field(form, "logoMediaId"),
    },
    hero: {
      eyebrow: field(form, "heroEyebrow"),
      title: field(form, "heroTitle"),
      emphasis: field(form, "heroEmphasis"),
      ctaLabel: field(form, "heroCtaLabel"),
      ctaHref: field(form, "heroCtaHref"),
      imageMediaId: field(form, "heroImageMediaId"),
    },
    rooms: {
      eyebrow: field(form, "roomsEyebrow"),
      title: field(form, "roomsTitle"),
      lead: field(form, "roomsLead"),
      cardLinkLabel: field(form, "roomsCardLinkLabel"),
    },
    latest: {
      eyebrow: field(form, "latestEyebrow"),
      title: field(form, "latestTitle"),
      linkLabel: field(form, "latestLinkLabel"),
      emptyTitle: field(form, "latestEmptyTitle"),
      emptyBody: field(form, "latestEmptyBody"),
    },
    principles: {
      eyebrow: field(form, "principlesEyebrow"),
      title: field(form, "principlesTitle"),
      items: principles,
    },
    footerNote: field(form, "footerNote"),
    categories: CATEGORY_SLUGS.map((slug) => ({
      slug,
      name: field(form, `category.${slug}.name`),
      navLabel: field(form, `category.${slug}.navLabel`),
      description: field(form, `category.${slug}.description`),
      intro: field(form, `category.${slug}.intro`),
      covers: field(form, `category.${slug}.covers`)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      imageMediaId: field(form, `category.${slug}.imageMediaId`),
    })),
  };
}

export function homepageFieldErrors(
  error: z.ZodError,
  slugs: readonly string[] = CATEGORY_SLUGS,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map((part, index) => {
      if (issue.path[0] === "categories" && index === 1 && typeof part === "number") {
        return slugs[part] ?? String(part);
      }
      return String(part);
    });
    const key = path.join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

export function categoryBySlug(content: HomepageContent, slug: CategorySlug) {
  return content.categories.find((category) => category.slug === slug);
}
