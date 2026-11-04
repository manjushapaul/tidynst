import type { CSSProperties } from "react";
import { z } from "zod";

/**
 * How the image beside each article section is drawn. Every setting is a fixed choice, so the
 * public page only ever receives CSS values from these lists.
 */
export const ARTICLE_IMAGE_OPTIONS = {
  aspectRatio: [
    { value: "3:4", label: "Portrait (3:4)", css: "3 / 4" },
    { value: "2:3", label: "Tall portrait (2:3)", css: "2 / 3" },
    { value: "1:1", label: "Square (1:1)", css: "1 / 1" },
    { value: "4:3", label: "Landscape (4:3)", css: "4 / 3" },
    { value: "16:9", label: "Wide (16:9)", css: "16 / 9" },
    { value: "original", label: "Original shape", css: "auto" },
  ],
  objectFit: [
    { value: "cover", label: "Fill the frame (crops edges)", css: "cover" },
    { value: "contain", label: "Show the whole image", css: "contain" },
  ],
  borderRadius: [
    { value: "card", label: "Rounded (like cards)", css: "var(--radius-card)" },
    { value: "small", label: "Slightly rounded", css: "0.5rem" },
    { value: "none", label: "Square corners", css: "0" },
  ],
  width: [
    { value: "100%", label: "Full column (100%)", css: "100%" },
    { value: "75%", label: "Three quarters (75%)", css: "75%" },
    { value: "50%", label: "Half (50%)", css: "50%" },
  ],
  height: [
    { value: "auto", label: "Automatic (from the shape)", css: "auto" },
    { value: "16rem", label: "Short (16rem)", css: "16rem" },
    { value: "24rem", label: "Medium (24rem)", css: "24rem" },
    { value: "32rem", label: "Tall (32rem)", css: "32rem" },
  ],
} as const;

type Options = typeof ARTICLE_IMAGE_OPTIONS;
export type ArticleImageSetting = keyof Options;

export const ARTICLE_IMAGE_SETTING_LABELS: Record<ArticleImageSetting, string> = {
  aspectRatio: "Shape",
  objectFit: "Fit",
  borderRadius: "Corners",
  width: "Width",
  height: "Height",
};

const values = <K extends ArticleImageSetting>(key: K) =>
  ARTICLE_IMAGE_OPTIONS[key].map((option) => option.value) as [
    Options[K][number]["value"],
    ...Options[K][number]["value"][],
  ];

export const ARTICLE_IMAGE_DEFAULTS = {
  aspectRatio: "3:4",
  objectFit: "cover",
  borderRadius: "card",
  width: "100%",
  height: "auto",
} as const satisfies { [K in ArticleImageSetting]: Options[K][number]["value"] };

export const articleImageStyleSchema = z
  .object({
    aspectRatio: z.enum(values("aspectRatio")).default(ARTICLE_IMAGE_DEFAULTS.aspectRatio),
    objectFit: z.enum(values("objectFit")).default(ARTICLE_IMAGE_DEFAULTS.objectFit),
    borderRadius: z.enum(values("borderRadius")).default(ARTICLE_IMAGE_DEFAULTS.borderRadius),
    width: z.enum(values("width")).default(ARTICLE_IMAGE_DEFAULTS.width),
    height: z.enum(values("height")).default(ARTICLE_IMAGE_DEFAULTS.height),
  })
  .strict();

export type ArticleImageStyle = z.output<typeof articleImageStyleSchema>;

const SETTINGS = Object.keys(ARTICLE_IMAGE_DEFAULTS) as ArticleImageSetting[];

/** Stored settings from before this existed, or that no longer parse, fall back to the defaults. */
export function resolveArticleImageStyle(raw: unknown): ArticleImageStyle {
  const parsed = articleImageStyleSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...ARTICLE_IMAGE_DEFAULTS };
}

export function isDefaultArticleImageStyle(style: ArticleImageStyle): boolean {
  return SETTINGS.every((key) => style[key] === ARTICLE_IMAGE_DEFAULTS[key]);
}

function cssValue<K extends ArticleImageSetting>(key: K, value: ArticleImageStyle[K]): string {
  const options: ReadonlyArray<{ value: string; css: string }> = ARTICLE_IMAGE_OPTIONS[key];
  return options.find((option) => option.value === value)?.css ?? "";
}

/**
 * CSS variables read by `.prose-article .article-row-media img`. Empty when nothing changed, unless
 * `always` is set (an image with its own settings must override the article's).
 */
export function articleImageCssVars(style: ArticleImageStyle, always = false): CSSProperties | undefined {
  if (!always && isDefaultArticleImageStyle(style)) return undefined;
  return {
    "--article-img-ratio": cssValue("aspectRatio", style.aspectRatio),
    "--article-img-fit": cssValue("objectFit", style.objectFit),
    "--article-img-radius": cssValue("borderRadius", style.borderRadius),
    "--article-img-width": cssValue("width", style.width),
    "--article-img-height": cssValue("height", style.height),
  } as CSSProperties;
}

/** The same look as plain style properties, for previewing one image outside an article. */
export function articleImageInlineStyle(style: ArticleImageStyle): CSSProperties {
  return {
    aspectRatio: cssValue("aspectRatio", style.aspectRatio),
    objectFit: cssValue("objectFit", style.objectFit) as CSSProperties["objectFit"],
    borderRadius: cssValue("borderRadius", style.borderRadius),
    width: cssValue("width", style.width),
    height: cssValue("height", style.height),
  };
}

/**
 * A body image's own settings travel with it in the Markdown, as a fragment on its address:
 * `/media/<id>/<file>#shape=1:1&fit=contain`. Only settings that differ from the defaults are
 * written, and values that are not in the option lists are ignored when read.
 */
const FRAGMENT_KEYS: Record<ArticleImageSetting, string> = {
  aspectRatio: "shape",
  objectFit: "fit",
  borderRadius: "corners",
  width: "width",
  height: "height",
};

const fragmentToken = (value: string) => value.replace("%", "");

export function splitImageSrc(src: string): { path: string; style: Partial<ArticleImageStyle> | null } {
  const hash = src.indexOf("#");
  if (hash === -1) return { path: src, style: null };
  const params = new URLSearchParams(src.slice(hash + 1));
  const style: Partial<Record<ArticleImageSetting, string>> = {};
  for (const key of SETTINGS) {
    const token = params.get(FRAGMENT_KEYS[key]);
    const options: ReadonlyArray<{ value: string }> = ARTICLE_IMAGE_OPTIONS[key];
    const option = options.find((item) => fragmentToken(item.value) === token);
    if (option) style[key] = option.value;
  }
  return {
    path: src.slice(0, hash),
    style: Object.keys(style).length ? (style as Partial<ArticleImageStyle>) : null,
  };
}

/** An image with its own settings ignores the article's; one without uses them. */
export function resolveImageStyle(
  own: Partial<ArticleImageStyle> | null,
  article: ArticleImageStyle,
): ArticleImageStyle {
  return own ? { ...ARTICLE_IMAGE_DEFAULTS, ...own } : article;
}

/**
 * The image address carrying `style`. Matching the article's settings needs no fragment. Otherwise
 * at least one setting is written, even if every value is a default, so the image overrides an
 * article whose settings differ from the defaults.
 */
export function withImageStyle(
  src: string,
  style: ArticleImageStyle,
  article: ArticleImageStyle = ARTICLE_IMAGE_DEFAULTS,
): string {
  const { path } = splitImageSrc(src);
  if (SETTINGS.every((key) => style[key] === article[key])) return path;
  const changed = SETTINGS.filter((key) => style[key] !== ARTICLE_IMAGE_DEFAULTS[key]);
  const keys = changed.length ? changed : (["aspectRatio"] as const);
  return `${path}#${keys.map((key) => `${FRAGMENT_KEYS[key]}=${fragmentToken(style[key])}`).join("&")}`;
}

/** Short summary, for showing which look an image has. */
export function summariseArticleImageStyle(style: ArticleImageStyle): string {
  if (isDefaultArticleImageStyle(style)) return "Default look";
  return SETTINGS.filter((key) => style[key] !== ARTICLE_IMAGE_DEFAULTS[key])
    .map((key) => {
      const options: ReadonlyArray<{ value: string; label: string }> = ARTICLE_IMAGE_OPTIONS[key];
      return options.find((option) => option.value === style[key])?.label ?? style[key];
    })
    .join(" · ");
}

/** One line per setting, for revision and review comparisons. */
export function describeArticleImageStyle(style: ArticleImageStyle): string {
  return SETTINGS.map((key) => {
    const options: ReadonlyArray<{ value: string; label: string }> = ARTICLE_IMAGE_OPTIONS[key];
    const label = options.find((option) => option.value === style[key])?.label ?? style[key];
    return `${ARTICLE_IMAGE_SETTING_LABELS[key]}: ${label}`;
  }).join("\n");
}
