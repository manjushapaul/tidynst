"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IMAGE_ACCEPT, uploadImage } from "./upload-image";

type SelectedIcon = { id: string; src: string };

export function SubcategoryIconUpload({
  csrf,
  defaultId,
  defaultSrc,
  altText,
}: {
  csrf: string;
  defaultId: string | null;
  defaultSrc: string | null;
  altText: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedIcon | null>(
    defaultId && defaultSrc ? { id: defaultId, src: defaultSrc } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const reset = () => {
      setSelected(defaultId && defaultSrc ? { id: defaultId, src: defaultSrc } : null);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultId, defaultSrc]);

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setError(null);
    const result = await uploadImage(csrf, file, `${altText} icon`);
    setUploading(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setSelected({ id: result.id, src: result.src });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="min-w-0 space-y-1.5 sm:w-52">
      <input ref={hiddenRef} type="hidden" name="iconMediaId" value={selected?.id ?? ""} />
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        Image icon
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex min-h-10 items-center gap-2">
        {selected ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selected.src} alt="" className="size-10 shrink-0 rounded-lg border border-line bg-surface object-contain p-1" />
        ) : null}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-oak-deep hover:bg-oak-pale disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading…" : selected ? "Change image" : "Upload image"}
        </button>
        {selected ? (
          <button
            type="button"
            className="text-xs font-medium text-muted underline underline-offset-2 hover:text-ink"
            onClick={() => setSelected(null)}
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Square image · JPEG, PNG, WebP or AVIF · max 5 MB. Save to apply.
      </p>
      {error ? <p role="alert" className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
