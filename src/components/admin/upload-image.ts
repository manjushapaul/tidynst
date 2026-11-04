export type PickerAsset = {
  id: string;
  src: string;
  altText: string;
  filename: string;
  width: number;
  height: number;
  byteSize?: number;
  /** Where the image is still referenced: a live article, or another article's draft. */
  usedBy?: "published" | "homepage" | "draft" | null;
};

export const MEDIA_USE_LABELS = {
  published: "On a published article — cannot delete",
  homepage: "On the homepage — cannot delete",
  draft: "In another article's draft — cannot delete",
} as const;

export const MEDIA_DELETE_BLOCKED = {
  published:
    "This image is on a published article. Remove it from the live page (and any drafts or revisions) before deleting it.",
  homepage: "This image is used on the homepage. Choose a different logo or photo there before deleting it.",
  draft: "This image is in another article's draft. Remove it from that draft before deleting it.",
  here: "This image is used in this article. Remove it here and save before deleting it from the library.",
} as const;

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export const ARTICLE_IMAGE_SIZE_HINT = "Recommended size: 350 × 400 px (portrait).";

export const FEATURED_IMAGE_SIZE_HINT = "Recommended size: 2176 × 934 px (21:9 landscape).";

export type UploadProgress = { loaded: number; total: number; percent: number };

/**
 * Uploads one image to the media library with XHR so browsers can report upload progress.
 * Resolves to the new asset, or to an error message.
 */
export function uploadImage(
  csrf: string,
  file: File,
  altText: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<PickerAsset | string> {
  return new Promise((resolve) => {
    const body = new FormData();
    body.set("csrf", csrf);
    body.set("altText", altText);
    body.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/media/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress({ loaded: event.loaded, total: event.total, percent });
    };
    xhr.onload = () => {
      const payload = (xhr.response ?? {}) as { ok?: boolean; message?: string; asset?: PickerAsset };
      if (xhr.status < 200 || xhr.status >= 300 || !payload.ok || !payload.asset) {
        resolve(payload.message ?? "The upload failed.");
        return;
      }
      resolve(payload.asset);
    };
    xhr.onerror = () => resolve("The upload failed. Check your connection and try again.");
    xhr.onabort = () => resolve("The upload was cancelled.");
    xhr.send(body);
  });
}
