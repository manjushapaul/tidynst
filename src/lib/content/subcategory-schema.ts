import { z } from "zod";
import { CATEGORY_SLUGS } from "@/content/categories";

export const SUBCATEGORY_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  descriptionMin: 20,
  descriptionMax: 300,
  groupsMax: 20,
  subcategoriesMax: 40,
} as const;

const nameSchema = z
  .string()
  .trim()
  .min(SUBCATEGORY_LIMITS.nameMin, `Name must be at least ${SUBCATEGORY_LIMITS.nameMin} characters.`)
  .max(SUBCATEGORY_LIMITS.nameMax, `Name must be ${SUBCATEGORY_LIMITS.nameMax} characters or fewer.`);

const descriptionSchema = z
  .string()
  .trim()
  .min(
    SUBCATEGORY_LIMITS.descriptionMin,
    `Description must be at least ${SUBCATEGORY_LIMITS.descriptionMin} characters.`,
  )
  .max(
    SUBCATEGORY_LIMITS.descriptionMax,
    `Description must be ${SUBCATEGORY_LIMITS.descriptionMax} characters or fewer.`,
  );

export const groupFieldsSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema,
  })
  .strict();

export const createGroupSchema = groupFieldsSchema
  .extend({
    category: z.enum(CATEGORY_SLUGS),
  })
  .strict();

export const subcategoryNameSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export function subcategoryFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
