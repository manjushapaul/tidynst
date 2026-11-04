import type { CSSProperties } from "react";
import { z } from "zod";

/**
 * How the featured (banner) image is drawn in its wide frame at the top of an article. Every
 * setting is a fixed choice, so the public page only ever receives CSS values from these lists.
 */
export const FEATURED_IMAGE_OPTIONS = {
  objectFit: [
    { value: "cover", label: "Fill the frame (crops edges)", css: "cover" },
    { value: "contain", label: "Show the whole image", css: "contain" },
  ],
  objectPosition: [
    { value: "top", label: "Top", css: "top" },
    { value: "center", label: "Center", css: "center" },
    { value: "bottom", label: "Bottom", css: "bottom" },
    { value: "left", label: "Left", css: "left" },
    { value: "right", label: "Right", css: "right" },
  ],
} as const;

type Options = typeof FEATURED_IMAGE_OPTIONS;
export type FeaturedImageSetting = keyof Options;

export const FEATURED_IMAGE_SETTING_LABELS: Record<FeaturedImageSetting, string> = {
  objectFit: "Fit",
  objectPosition: "Position",
};

const values = <K extends FeaturedImageSetting>(key: K) =>
  FEATURED_IMAGE_OPTIONS[key].map((option) => option.value) as [
    Options[K][number]["value"],
    ...Options[K][number]["value"][],
  ];

export const FEATURED_IMAGE_DEFAULTS = {
  objectFit: "cover",
  objectPosition: "top",
} as const satisfies { [K in FeaturedImageSetting]: Options[K][number]["value"] };

export const featuredImageStyleSchema = z
  .object({
    objectFit: z.enum(values("objectFit")).default(FEATURED_IMAGE_DEFAULTS.objectFit),
    objectPosition: z.enum(values("objectPosition")).default(FEATURED_IMAGE_DEFAULTS.objectPosition),
  })
  .strict();

export type FeaturedImageStyle = z.output<typeof featuredImageStyleSchema>;

const SETTINGS = Object.keys(FEATURED_IMAGE_DEFAULTS) as FeaturedImageSetting[];

/** Stored settings from before this existed, or that no longer parse, fall back to the defaults. */
export function resolveFeaturedImageStyle(raw: unknown): FeaturedImageStyle {
  const parsed = featuredImageStyleSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...FEATURED_IMAGE_DEFAULTS };
}

export function isDefaultFeaturedImageStyle(style: FeaturedImageStyle): boolean {
  return SETTINGS.every((key) => style[key] === FEATURED_IMAGE_DEFAULTS[key]);
}

function cssValue<K extends FeaturedImageSetting>(key: K, value: FeaturedImageStyle[K]): string {
  const options: ReadonlyArray<{ value: string; css: string }> = FEATURED_IMAGE_OPTIONS[key];
  return options.find((option) => option.value === value)?.css ?? "";
}

export function featuredImageInlineStyle(style: FeaturedImageStyle): CSSProperties {
  return {
    objectFit: cssValue("objectFit", style.objectFit) as CSSProperties["objectFit"],
    objectPosition: cssValue("objectPosition", style.objectPosition),
  };
}

/** One line per setting, for revision and review comparisons. */
export function describeFeaturedImageStyle(style: FeaturedImageStyle): string {
  return SETTINGS.map((key) => {
    const options: ReadonlyArray<{ value: string; label: string }> = FEATURED_IMAGE_OPTIONS[key];
    const label = options.find((option) => option.value === style[key])?.label ?? style[key];
    return `${FEATURED_IMAGE_SETTING_LABELS[key]}: ${label}`;
  }).join("\n");
}
