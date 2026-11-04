"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ARTICLE_IMAGE_DEFAULTS,
  ARTICLE_IMAGE_OPTIONS,
  ARTICLE_IMAGE_SETTING_LABELS,
  type ArticleImageSetting,
  type ArticleImageStyle,
  articleImageInlineStyle,
  isDefaultArticleImageStyle,
} from "@/lib/content/article-image-style";
import { Field, inputClasses, useControlledSelect } from "./form";

const HINTS: Partial<Record<ArticleImageSetting, string>> = {
  aspectRatio: "On phones every section image is cropped to the article banner's wide shape.",
  objectFit: "Filling the frame crops the edges; showing the whole image may leave empty space.",
  height: "A fixed height takes priority over the shape.",
};

function SettingSelect<K extends ArticleImageSetting>({
  setting,
  value,
  onChange,
}: {
  setting: K;
  value: ArticleImageStyle[K];
  onChange: (value: ArticleImageStyle[K]) => void;
}) {
  const ref = useControlledSelect(value, null);
  const options: ReadonlyArray<{ value: string; label: string }> = ARTICLE_IMAGE_OPTIONS[setting];
  return (
    <Field label={ARTICLE_IMAGE_SETTING_LABELS[setting]} hint={HINTS[setting]}>
      {(props) => (
        <select
          {...props}
          ref={ref}
          value={value}
          className={inputClasses}
          onChange={(event) => onChange(event.target.value as ArticleImageStyle[K])}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.value === ARTICLE_IMAGE_DEFAULTS[setting] ? " — default" : ""}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

const SETTINGS = Object.keys(ARTICLE_IMAGE_DEFAULTS) as ArticleImageSetting[];

/**
 * Asks how one section image is shown: shape, fit, corners, width and height. Opens whenever
 * `image` is set; `onSave` receives the chosen settings.
 */
export function ImageStyleDialog({
  image,
  initial,
  onSave,
  onClose,
}: {
  image: { src: string; alt: string } | null;
  initial: ArticleImageStyle;
  onSave: (style: ArticleImageStyle) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState(initial);
  const shown = image?.src ?? null;
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (shown !== shownFor) {
    setShownFor(shown);
    if (shown) setDraft(initial);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shown && !dialog.open) dialog.showModal();
    if (!shown && dialog.open) dialog.close();
  }, [shown]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-sans text-base font-semibold tracking-normal">
            Section image
          </h2>
          <button
            type="button"
            className="text-sm text-oak-deep disabled:text-muted"
            disabled={isDefaultArticleImageStyle(draft)}
            onClick={() => setDraft({ ...ARTICLE_IMAGE_DEFAULTS })}
          >
            Reset to defaults
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs text-muted">
            How this image is shown beside its section of the article. Other images are not changed.
          </p>
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="grid gap-4 sm:grid-cols-2">
              {SETTINGS.map((setting) => (
                <SettingSelect
                  key={setting}
                  setting={setting}
                  value={draft[setting]}
                  onChange={(next) => setDraft((current) => ({ ...current, [setting]: next }))}
                />
              ))}
            </div>
            {image ? (
              <figure className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  alt={image.alt}
                  className="mx-auto block max-h-96 bg-oak-pale shadow-(--shadow-card)"
                  style={articleImageInlineStyle(draft)}
                />
                <figcaption className="text-center text-xs text-muted">Preview</figcaption>
              </figure>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 border-t border-line bg-canvas px-5 py-4">
          <button
            type="button"
            className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              onSave(draft);
              dialogRef.current?.close();
            }}
          >
            Apply
          </button>
          <button type="button" className="text-sm text-muted" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
