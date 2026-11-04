"use client";

import { useId, useRef, useState } from "react";
import {
  ARTICLE_IMAGE_DEFAULTS,
  type ArticleImageStyle,
  summariseArticleImageStyle,
  withImageStyle,
} from "@/lib/content/article-image-style";
import { CAPTION_MAX, imagesMarkdown } from "@/lib/content/body-images";
import { cn } from "@/lib/cn";
import { ImageStyleDialog } from "./article-image-style-editor";
import { DeleteImageButton } from "./delete-image-button";
import { fileInputClasses, inputClasses } from "./form";
import { ARTICLE_IMAGE_SIZE_HINT, IMAGE_ACCEPT, type PickerAsset, uploadImage } from "./upload-image";

export type { PickerAsset } from "./upload-image";

type PendingUpload = { key: string; file: File; altText: string; error: string | null };
type Selection = { id: string; caption: string; style: ArticleImageStyle };

export function MediaPicker({
  csrf,
  media: assets,
  onInsert,
  onUploaded,
  canDelete,
  usedIds,
  onDeleted,
  imageStyles = ARTICLE_IMAGE_DEFAULTS,
}: {
  csrf: string;
  media: PickerAsset[];
  onInsert: (markdown: string) => void;
  onUploaded: (asset: PickerAsset) => void;
  canDelete: boolean;
  usedIds: ReadonlySet<string>;
  onDeleted: (id: string) => void;
  /** The article's section image settings; each inserted image starts from these. */
  imageStyles?: ArticleImageStyle;
}) {
  const [styling, setStyling] = useState<PickerAsset | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const chosen = selected.flatMap((item) => {
    const asset = byId.get(item.id);
    return asset ? [{ asset, caption: item.caption, style: item.style }] : [];
  });
  const stylingStyle = selected.find((item) => item.id === styling?.id)?.style ?? imageStyles;

  function close() {
    dialogRef.current?.close();
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.some((item) => item.id === id)
        ? current.filter((item) => item.id !== id)
        : [...current, { id, caption: "", style: imageStyles }],
    );
  }

  function chooseFiles(files: FileList | null) {
    setMessage(null);
    setError(null);
    setUploads(
      Array.from(files ?? []).map((file, index) => ({
        key: `${index}-${file.name}-${file.size}`,
        file,
        altText: "",
        error: null,
      })),
    );
  }

  async function uploadAll() {
    if (uploads.length === 0) {
      setError("Choose one or more image files.");
      return;
    }
    setError(null);
    setMessage(null);
    const failed: PendingUpload[] = [];
    const added: PickerAsset[] = [];
    for (const [index, item] of uploads.entries()) {
      setProgress(`Uploading ${index + 1} of ${uploads.length}…`);
      const result = await uploadImage(csrf, item.file, item.altText);
      if (typeof result === "string") {
        failed.push({ ...item, error: result });
        continue;
      }
      added.push(result);
      onUploaded(result);
    }
    setProgress(null);
    setSelected((current) => [
      ...current,
      ...added
        .filter((asset) => !current.some((item) => item.id === asset.id))
        .map((asset) => ({ id: asset.id, caption: "", style: imageStyles })),
    ]);
    setUploads(failed);
    if (fileInputRef.current && failed.length === 0) fileInputRef.current.value = "";
    if (added.length) {
      setMessage(
        `${added.length === 1 ? "1 image" : `${added.length} images`} uploaded and selected below.` +
          (failed.length ? " Fix the ones that failed and upload them again." : ""),
      );
    }
    if (failed.length && !added.length) setError("No images were uploaded. See the messages below.");
  }

  function insertSelected() {
    if (chosen.length === 0) return;
    onInsert(
      imagesMarkdown(
        chosen.map(({ asset, caption, style }) => ({
          src: withImageStyle(asset.src, style, imageStyles),
          altText: asset.altText,
          caption,
        })),
      ),
    );
    setSelected([]);
    close();
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          aria-describedby={`${ids}-size`}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-oak-deep hover:bg-oak-pale"
          onClick={() => dialogRef.current?.showModal()}
        >
          Add images
        </button>
        <p id={`${ids}-size`} className="text-xs text-muted">
          {ARTICLE_IMAGE_SIZE_HINT}
        </p>
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${ids}-title`}
        className="m-auto w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
            <h2 id={`${ids}-title`} className="font-sans text-base font-semibold tracking-normal">
              Media library
            </h2>
            <button type="button" className="text-sm text-muted" onClick={close}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="space-y-3 rounded-xl bg-canvas p-4">
              <p className="text-sm font-medium">Upload images</p>
              <p className="text-xs text-muted">
                Choose one or more files, describe each one, then upload. JPEG, PNG, WebP or AVIF, up to 5 MB
                each. {ARTICLE_IMAGE_SIZE_HINT}
              </p>
              <label className="block text-sm font-medium" htmlFor={`${ids}-files`}>
                Image files
              </label>
              <input
                ref={fileInputRef}
                id={`${ids}-files`}
                type="file"
                multiple
                accept={IMAGE_ACCEPT}
                className={fileInputClasses}
                onChange={(event) => chooseFiles(event.target.files)}
              />
              {uploads.length ? (
                <ul className="space-y-3">
                  {uploads.map((item, index) => (
                    <li key={item.key} className="rounded-lg border border-line bg-surface p-3">
                      <label className="block text-sm font-medium" htmlFor={`${ids}-alt-${index}`}>
                        Alt text for <span className="break-all">{item.file.name}</span>
                      </label>
                      <input
                        id={`${ids}-alt-${index}`}
                        value={item.altText}
                        onChange={(event) =>
                          setUploads((current) =>
                            current.map((entry) =>
                              entry.key === item.key ? { ...entry, altText: event.target.value } : entry,
                            ),
                          )
                        }
                        minLength={5}
                        maxLength={200}
                        aria-invalid={item.error ? true : undefined}
                        aria-describedby={item.error ? `${ids}-alt-${index}-error` : undefined}
                        className={cn(inputClasses, "mt-1")}
                        placeholder="Describe what the image shows"
                      />
                      {item.error ? (
                        <p id={`${ids}-alt-${index}-error`} className="mt-1 text-xs text-danger">
                          {item.error}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {uploads.length ? (
                <button
                  type="button"
                  disabled={progress !== null}
                  onClick={() => void uploadAll()}
                  className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {progress ?? (uploads.length > 1 ? `Upload ${uploads.length} images` : "Upload image")}
                </button>
              ) : null}
              <div role="status" aria-live="polite" className="text-sm text-oak-deep">
                {message}
              </div>
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            {assets.length === 0 ? (
              <p className="text-sm text-muted">No images yet.</p>
            ) : (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  Select images to add to the body, in the order you want them
                </legend>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assets.map((asset) => {
                    const position = selected.findIndex((item) => item.id === asset.id);
                    const isSelected = position >= 0;
                    return (
                      <li
                        key={asset.id}
                        className={cn(
                          "relative rounded-xl border p-2",
                          isSelected ? "border-oak ring-2 ring-oak/40" : "border-line",
                        )}
                      >
                        {isSelected ? (
                          <span
                            aria-hidden="true"
                            className="absolute top-3 left-3 grid size-6 place-items-center rounded-full bg-oak text-xs font-semibold text-white"
                          >
                            {position + 1}
                          </span>
                        ) : null}
                        {/* Library thumbnails are stored media of known dimensions. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.src}
                          alt=""
                          width={asset.width}
                          height={asset.height}
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                        <label className="mt-2 flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={isSelected}
                            onChange={() => toggle(asset.id)}
                          />
                          <span className="line-clamp-2 text-muted">{asset.altText}</span>
                        </label>
                        {canDelete ? (
                          <DeleteImageButton
                            csrf={csrf}
                            asset={asset}
                            usedHere={usedIds.has(asset.id)}
                            onDeleted={(id) => {
                              setSelected((current) => current.filter((item) => item.id !== id));
                              onDeleted(id);
                            }}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </div>

          {chosen.length ? (
            <div className="shrink-0 space-y-3 border-t border-line bg-canvas px-5 py-4">
              <p className="text-sm font-medium">
                {chosen.length === 1 ? "1 image selected" : `${chosen.length} images selected`}. Captions are
                optional and appear under each image. Use Edit to choose how each image is shown.
              </p>
              <ol className="max-h-48 space-y-3 overflow-y-auto">
                {chosen.map(({ asset, caption, style }, index) => (
                  <li key={asset.id} className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.src} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                    <label className="sr-only" htmlFor={`${ids}-caption-${asset.id}`}>
                      Caption for image {index + 1}: {asset.altText}
                    </label>
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        id={`${ids}-caption-${asset.id}`}
                        value={caption}
                        maxLength={CAPTION_MAX}
                        onChange={(event) =>
                          setSelected((current) =>
                            current.map((item) =>
                              item.id === asset.id ? { ...item, caption: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder={`Caption for image ${index + 1} (optional)`}
                        className={cn(inputClasses, "py-1.5 text-sm")}
                      />
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{summariseArticleImageStyle(style)}</span>
                        <button
                          type="button"
                          className="font-medium text-oak-deep"
                          aria-label={`Edit how image ${index + 1} is shown`}
                          onClick={() => setStyling(asset)}
                        >
                          Edit
                        </button>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={insertSelected}
                  className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white"
                >
                  {chosen.length === 1 ? "Insert image" : `Insert ${chosen.length} images`}
                </button>
                <button type="button" onClick={() => setSelected([])} className="text-sm text-muted">
                  Clear selection
                </button>
              </div>
              <p className="text-xs text-muted">Images are inserted where the cursor was in the body.</p>
            </div>
          ) : null}
        </div>
        <ImageStyleDialog
          image={styling ? { src: styling.src, alt: styling.altText } : null}
          initial={stylingStyle}
          onClose={() => setStyling(null)}
          onSave={(style) => {
            const id = styling?.id;
            setSelected((current) => current.map((item) => (item.id === id ? { ...item, style } : item)));
          }}
        />
      </dialog>
    </>
  );
}
