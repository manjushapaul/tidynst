import { z } from "zod";
import { CATEGORY_SLUGS } from "@/content/categories";
import { ARTICLE_IMAGE_DEFAULTS, articleImageStyleSchema } from "./article-image-style";
import { FEATURED_IMAGE_DEFAULTS, featuredImageStyleSchema } from "./featured-image-style";
import { isValidSlug } from "./slug";

export const GUIDE_LIMITS = {
  titleMin: 3,
  titleMax: 140,
  excerptMax: 300,
  bodyMax: 100_000,
  seoTitleMax: 70,
  seoDescriptionMax: 170,
  imageAltMax: 200,
  topicsMax: 12,
  productsMax: 12,
  productNoteMax: 300,
  faqsMax: 20,
  faqQuestionMax: 200,
  faqAnswerMax: 2_000,
} as const;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullable()
    .transform((value) => (value ? value : null));

/**
 * Everything that makes up a guide's content. Changing any of these fields is a material change:
 * it alters the content hash, which invalidates any existing review approval.
 */
export const guideContentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(GUIDE_LIMITS.titleMin, `Title must be at least ${GUIDE_LIMITS.titleMin} characters.`)
      .max(GUIDE_LIMITS.titleMax, `Title must be ${GUIDE_LIMITS.titleMax} characters or fewer.`),
    slug: z
      .string()
      .trim()
      .refine(isValidSlug, "Use lowercase letters, numbers and single hyphens (max 80 characters)."),
    excerpt: z
      .string()
      .trim()
      .max(GUIDE_LIMITS.excerptMax, `Summary must be ${GUIDE_LIMITS.excerptMax} characters or fewer.`),
    body: z
      .string()
      .max(GUIDE_LIMITS.bodyMax, "The article body is too long.")
      .transform((value) => value.replace(/\r\n?/g, "\n").replace(/\s+$/, "")),
    closing: z
      .string()
      .max(GUIDE_LIMITS.bodyMax, "The final thoughts section is too long.")
      .default("")
      .transform((value) => value.replace(/\r\n?/g, "\n").replace(/\s+$/, "")),
    category: z.enum(CATEGORY_SLUGS).nullable(),
    /** The topic inside the subcategory. Without one, topic pages match the article by title. */
    subcategoryId: z.uuid().nullable().default(null),
    /** The subcategory button this article is filed under. */
    subcategoryGroupId: z.uuid().nullable().default(null),
    topicIds: z
      .array(z.uuid())
      .max(GUIDE_LIMITS.topicsMax, `Choose at most ${GUIDE_LIMITS.topicsMax} topics.`)
      .refine((ids) => new Set(ids).size === ids.length, "Each topic can only be chosen once."),
    products: z
      .array(
        z.object({
          productId: z.uuid(),
          note: optionalText(GUIDE_LIMITS.productNoteMax, "Product note"),
        }),
      )
      .max(GUIDE_LIMITS.productsMax, `Recommend at most ${GUIDE_LIMITS.productsMax} products.`)
      .refine(
        (items) => new Set(items.map((item) => item.productId)).size === items.length,
        "Each product can only be recommended once.",
      ),
    seoTitle: optionalText(GUIDE_LIMITS.seoTitleMax, "SEO title"),
    seoDescription: optionalText(GUIDE_LIMITS.seoDescriptionMax, "Meta description"),
    featuredImageId: z.uuid().nullable(),
    featuredImageAlt: optionalText(GUIDE_LIMITS.imageAltMax, "Image alt text"),
    featuredImageStyle: featuredImageStyleSchema.default(FEATURED_IMAGE_DEFAULTS),
    faqs: z
      .array(
        z
          .object({
            question: z
              .string()
              .trim()
              .min(1, "Each FAQ needs a question.")
              .max(
                GUIDE_LIMITS.faqQuestionMax,
                `FAQ questions must be ${GUIDE_LIMITS.faqQuestionMax} characters or fewer.`,
              ),
            answer: z
              .string()
              .transform((value) => value.replace(/\r\n?/g, "\n").trim())
              .pipe(
                z
                  .string()
                  .min(1, "Each FAQ needs an answer.")
                  .max(
                    GUIDE_LIMITS.faqAnswerMax,
                    `FAQ answers must be ${GUIDE_LIMITS.faqAnswerMax} characters or fewer.`,
                  ),
              ),
          })
          .strict(),
      )
      .max(GUIDE_LIMITS.faqsMax, `Add at most ${GUIDE_LIMITS.faqsMax} FAQs.`)
      .default([]),
    articleImageStyle: articleImageStyleSchema.default(ARTICLE_IMAGE_DEFAULTS),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.subcategoryId || value.subcategoryGroupId) && !value.category) {
      ctx.addIssue({
        code: "custom",
        path: ["subcategoryGroupId"],
        message: "Choose a category before a subcategory.",
      });
    }
  });

export type GuideContentInput = z.input<typeof guideContentSchema>;
export type GuideContent = z.output<typeof guideContentSchema>;

export type FieldErrors = Partial<Record<keyof GuideContent | "form", string>>;

export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] as keyof GuideContent | undefined) ?? "form";
    errors[key] ??= issue.message;
  }
  return errors;
}
