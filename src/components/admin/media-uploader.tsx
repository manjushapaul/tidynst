"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fileInputClasses, inputClasses } from "./form";
import { formatBytes } from "@/lib/format";
import { uploadImage, type UploadProgress } from "./upload-image";

export function MediaUploader({ csrf }: { csrf: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  function chooseFile(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
    setError(null);
    setMessage(null);
    setProgress(null);
  }

  async function upload() {
    if (!file) {
      setError("Choose an image file.");
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    setProgress({ loaded: 0, total: file.size, percent: 0 });
    const result = await uploadImage(csrf, file, altText, setProgress);
    setPending(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setMessage(`Uploaded ${result.width}×${result.height} · ${formatBytes(result.byteSize ?? file.size)}.`);
    setAltText("");
    chooseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="library-file">
        Image file
      </label>
      <input
        ref={fileInputRef}
        id="library-file"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className={fileInputClasses}
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <p className="text-xs text-muted">
          {file.name} · {formatBytes(file.size)}
          {previewUrl ? " · preview below" : null}
        </p>
      ) : null}
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className="max-h-48 rounded-lg border border-line object-contain" />
      ) : null}
      <label className="block text-sm font-medium" htmlFor="library-alt">
        Alt text
      </label>
      <input
        id="library-alt"
        value={altText}
        minLength={5}
        maxLength={200}
        onChange={(event) => setAltText(event.target.value)}
        className={inputClasses}
        placeholder="Describe the image in 5–200 characters"
      />
      {progress && pending ? (
        <div className="space-y-1" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-oak-pale">
            <div className="h-full bg-oak transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="text-xs text-muted">Uploading… {progress.percent}%</p>
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => void upload()}
        className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
      {message ? (
        <p role="status" className="text-sm text-oak-deep">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
