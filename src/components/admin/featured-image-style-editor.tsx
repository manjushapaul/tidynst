"use client";

import {
  FEATURED_IMAGE_DEFAULTS,
  FEATURED_IMAGE_OPTIONS,
  FEATURED_IMAGE_SETTING_LABELS,
  type FeaturedImageSetting,
  type FeaturedImageStyle,
  featuredImageInlineStyle,
  isDefaultFeaturedImageStyle,
} from "@/lib/content/featured-image-style";
import { Field, inputClasses, useControlledSelect } from "./form";

const HINTS: Partial<Record<FeaturedImageSetting, string>> = {
  objectFit: "Filling the frame crops the edges; showing the whole image may leave empty space.",
  objectPosition: "Which part of the image stays in view when it is cropped.",
};

function SettingSelect<K extends FeaturedImageSetting>({
  setting,
  value,
  actionState,
  error,
  onChange,
}: {
  setting: K;
  value: FeaturedImageStyle[K];
  actionState: unknown;
  error?: string;
  onChange: (value: FeaturedImageStyle[K]) => void;
}) {
  const ref = useControlledSelect(value, actionState);
  const options: ReadonlyArray<{ value: string; label: string }> = FEATURED_IMAGE_OPTIONS[setting];
  return (
    <Field label={FEATURED_IMAGE_SETTING_LABELS[setting]} hint={HINTS[setting]} error={error}>
      {(props) => (
        <select
          {...props}
          ref={ref}
          value={value}
          className={inputClasses}
          onChange={(event) => onChange(event.target.value as FeaturedImageStyle[K])}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.value === FEATURED_IMAGE_DEFAULTS[setting] ? " — default" : ""}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

const SETTINGS = Object.keys(FEATURED_IMAGE_DEFAULTS) as FeaturedImageSetting[];

export function FeaturedImageStyleEditor({
  value,
  onChange,
  actionState,
  error,
  image,
}: {
  value: FeaturedImageStyle;
  onChange: (value: FeaturedImageStyle) => void;
  actionState: unknown;
  error?: string;
  image?: { src: string; alt: string } | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-medium tracking-normal">Banner framing</h3>
        <button
          type="button"
          className="text-sm text-oak-deep disabled:text-muted"
          disabled={isDefaultFeaturedImageStyle(value)}
          onClick={() => onChange({ ...FEATURED_IMAGE_DEFAULTS })}
        >
          Reset to defaults
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {SETTINGS.map((setting) => (
          <SettingSelect
            key={setting}
            setting={setting}
            value={value[setting]}
            actionState={actionState}
            onChange={(next) => onChange({ ...value, [setting]: next })}
          />
        ))}
      </div>
      {image ? (
        <figure className="space-y-2">
          <div className="relative aspect-[21/9] overflow-hidden rounded-(--radius-card) bg-oak-pale">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={image.alt}
              className="absolute inset-0 size-full"
              style={featuredImageInlineStyle(value)}
            />
          </div>
          <figcaption className="text-xs text-muted">
            Preview of the banner at the top of the article
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
