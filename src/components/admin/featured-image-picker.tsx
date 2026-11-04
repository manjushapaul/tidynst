"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DeleteImageButton } from "./delete-image-button";
import { fileInputClasses, inputClasses } from "./form";
import { FEATURED_IMAGE_SIZE_HINT, IMAGE_ACCEPT, type PickerAsset, uploadImage } from "./upload-image";

export function FeaturedImagePicker({
  csrf,
  media,
  currentId,
  onChoose,
  onUploaded,
  canDelete,
  usedIds,
  onDeleted,
  buttonLabel,
  hint = FEATURED_IMAGE_SIZE_HINT,
  align = "end",
}: {
  csrf: string;
  media: PickerAsset[];
  currentId: string;
  onChoose: (asset: PickerAsset) => void;
  onUploaded: (asset: PickerAsset) => void;
  canDelete: boolean;
  usedIds: ReadonlySet<string>;
  onDeleted: (id: string) => void;
  buttonLabel?: string;
  hint?: string;
  align?: "start" | "end";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setAltText("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function choose(asset: PickerAsset) {
    onChoose(asset);
    reset();
    dialogRef.current?.close();
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadImage(csrf, file, altText);
    setUploading(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    onUploaded(result);
    choose(result);
  }

  return (
    <>
      <div className={cn("flex flex-col gap-1", align === "start" ? "items-start" : "items-end")}>
        <button
          type="button"
          aria-describedby={`${ids}-size`}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-oak-deep hover:bg-oak-pale"
          onClick={() => dialogRef.current?.showModal()}
        >
          {buttonLabel ?? (currentId ? "Change featured image" : "Choose featured image")}
        </button>
        <p id={`${ids}-size`} className="text-xs text-muted">
          {hint}
        </p>
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${ids}-title`}
        onClose={reset}
        className="m-auto w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
            <h2 id={`${ids}-title`} className="font-sans text-base font-semibold tracking-normal">
              Featured image
            </h2>
            <button type="button" className="text-sm text-muted" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="space-y-3 rounded-xl bg-canvas p-4">
              <p className="text-sm font-medium">Upload a new image</p>
              <p className="text-xs text-muted">
                Shown at the top of the article and in previews when it is shared. JPEG, PNG, WebP or AVIF, up
                to 5 MB. {FEATURED_IMAGE_SIZE_HINT}
              </p>
              <label className="block text-sm font-medium" htmlFor={`${ids}-file`}>
                Image file
              </label>
              <input
                ref={fileInputRef}
                id={`${ids}-file`}
                type="file"
                accept={IMAGE_ACCEPT}
                className={fileInputClasses}
                onChange={(event) => {
                  setError(null);
                  setFile(event.target.files?.[0] ?? null);
                }}
              />
              {file ? (
                <>
                  <label className="block text-sm font-medium" htmlFor={`${ids}-alt`}>
                    Alt text for <span className="break-all">{file.name}</span>
                  </label>
                  <input
                    id={`${ids}-alt`}
                    value={altText}
                    onChange={(event) => setAltText(event.target.value)}
                    minLength={5}
                    maxLength={200}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${ids}-error` : undefined}
                    className={inputClasses}
                    placeholder="Describe what the image shows"
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void upload()}
                    className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : "Upload and use as featured image"}
                  </button>
                </>
              ) : null}
              {error ? (
                <p id={`${ids}-error`} role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            {media.length === 0 ? (
              <p className="text-sm text-muted">No images in the library yet.</p>
            ) : (
              <div>
                <p className="mb-2 text-sm font-medium">Or choose one from the library</p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {media.map((asset) => {
                    const isCurrent = asset.id === currentId;
                    return (
                      <li key={asset.id}>
                        <button
                          type="button"
                          aria-pressed={isCurrent}
                          onClick={() => choose(asset)}
                          className={cn(
                            "w-full rounded-xl border p-2 text-left hover:border-oak",
                            isCurrent ? "border-oak ring-2 ring-oak/40" : "border-line",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.src}
                            alt=""
                            width={asset.width}
                            height={asset.height}
                            className="aspect-square w-full rounded-lg object-cover"
                          />
                          <span className="mt-2 line-clamp-2 block text-xs text-muted">{asset.altText}</span>
                          {isCurrent ? (
                            <span className="mt-1 block text-xs font-medium text-oak-deep">Current</span>
                          ) : null}
                        </button>
                        {canDelete ? (
                          <DeleteImageButton
                            csrf={csrf}
                            asset={asset}
                            usedHere={usedIds.has(asset.id)}
                            onDeleted={onDeleted}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
