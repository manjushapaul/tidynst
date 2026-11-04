import { z } from "zod";
import { affiliateLinksEnabled, hasAffiliateTracking } from "@/lib/affiliate";
import { isValidSlug, SLUG_MAX_LENGTH } from "./slug";

export const PRODUCT_STATUSES = ["draft", "active", "retired"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  retired: "Retired",
};

export const PRODUCT_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  brandMax: 80,
  summaryMin: 20,
  summaryMax: 300,
  merchantMax: 80,
  urlMax: 2000,
} as const;

/** Allowed status changes. A retired product goes back to draft and is re-checked before it can be active again. */
const TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  draft: ["active", "retired"],
  active: ["draft", "retired"],
  retired: ["draft"],
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Fields shown to readers on published articles; editing them on an active product changes live pages. */
export const READER_VISIBLE_FIELDS = ["name", "brand", "summary", "merchantName", "productUrl"] as const;
export type ReaderVisibleField = (typeof READER_VISIBLE_FIELDS)[number];

export const READER_VISIBLE_FIELD_LABELS: Record<ReaderVisibleField, string> = {
  name: "name",
  brand: "brand",
  summary: "summary",
  merchantName: "merchant",
  productUrl: "link",
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((value) => value || null);

/** Returns a problem with a product link, or null when it is acceptable. */
export function productUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full web address starting with https://.";
  }
  if (url.protocol !== "https:") return "Product links must use https://.";
  if (url.username || url.password) return "Product links cannot contain a username or password.";
  if (!url.hostname.includes(".")) return "Enter a public web address.";
  if (!affiliateLinksEnabled() && hasAffiliateTracking(url)) {
    return "Remove affiliate tracking from the link. Affiliate links are disabled.";
  }
  return null;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date (YYYY-MM-DD) in India, where the editors work; verification dates cannot be later. */
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export const productInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(PRODUCT_LIMITS.nameMin, "Enter the product name.")
      .max(PRODUCT_LIMITS.nameMax, `Name must be at most ${PRODUCT_LIMITS.nameMax} characters.`),
    slug: z
      .string()
      .trim()
      .max(SLUG_MAX_LENGTH, `Use at most ${SLUG_MAX_LENGTH} characters.`)
      .refine(isValidSlug, "Use lowercase letters, numbers and single hyphens."),
    brand: optionalText(PRODUCT_LIMITS.brandMax, "Brand"),
    summary: z
      .string()
      .trim()
      .min(PRODUCT_LIMITS.summaryMin, `Write a summary of at least ${PRODUCT_LIMITS.summaryMin} characters.`)
      .max(PRODUCT_LIMITS.summaryMax, `Summary must be at most ${PRODUCT_LIMITS.summaryMax} characters.`),
    merchantName: optionalText(PRODUCT_LIMITS.merchantMax, "Merchant"),
    productUrl: z
      .string()
      .trim()
      .max(PRODUCT_LIMITS.urlMax, "That link is too long.")
      .transform((value) => value || null)
      .superRefine((value, ctx) => {
        const problem = value ? productUrlProblem(value) : null;
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
    verifiedOn: z
      .string()
      .trim()
      .transform((value) => value || null)
      .superRefine((value, ctx) => {
        if (!value) return;
        if (!isRealDate(value)) ctx.addIssue({ code: "custom", message: "Enter a valid date." });
        else if (value > todayInIndia()) {
          ctx.addIssue({ code: "custom", message: "The verification date cannot be in the future." });
        } else if (value < "2000-01-01") ctx.addIssue({ code: "custom", message: "Enter a recent date." });
      }),
    status: z.enum(PRODUCT_STATUSES, "Choose a status."),
  })
  .superRefine((value, ctx) => {
    if (value.status === "active" && !value.verifiedOn) {
      ctx.addIssue({
        code: "custom",
        path: ["verifiedOn"],
        message: "Record the date you checked the details before making the product active.",
      });
    }
  });

export type ProductInput = z.output<typeof productInputSchema>;
export type ProductFieldErrors = Partial<Record<keyof ProductInput | "confirmImpact" | "form", string>>;

export function productFieldErrors(error: z.ZodError): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] as keyof ProductInput | undefined) ?? "form";
    errors[key] ??= issue.message;
  }
  return errors;
}
