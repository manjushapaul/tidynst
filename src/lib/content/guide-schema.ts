import { z } from "zod";
import { CATEGORY_SLUGS } from "@/content/categories";
import { isValidSlug } from "./slug";

export const GUIDE_LIMITS = {
  titleMin: 3,
  titleMax: 140,
  excerptMax: 300,
  bodyMax: 100_000,
  seoTitleMax: 70,
  seoDescriptionMax: 170,
  imageAltMax: 200,
  topicsMax: 6,
  productsMax: 12,
  productNoteMax: 300,
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
      .max(GUIDE_LIMITS.bodyMax, "The guide body is too long.")
      .transform((value) => value.replace(/\r\n?/g, "\n").replace(/\s+$/, "")),
    category: z.enum(CATEGORY_SLUGS).nullable(),
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
  })
  .strict();

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
