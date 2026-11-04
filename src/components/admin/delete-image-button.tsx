"use client";

import { useState } from "react";
import { deleteMediaAction } from "@/app/admin/(panel)/media/actions";
import { MEDIA_DELETE_BLOCKED, MEDIA_USE_LABELS, type PickerAsset } from "./upload-image";

export function DeleteImageButton({
  csrf,
  asset,
  usedHere,
  onDeleted,
}: {
  csrf: string;
  asset: PickerAsset;
  /** Linked from the article being edited, including unsaved changes. */
  usedHere: boolean;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = usedHere || Boolean(asset.usedBy);

  async function remove() {
    if (blocked) {
      setError(
        usedHere
          ? MEDIA_DELETE_BLOCKED.here
          : asset.usedBy
            ? MEDIA_DELETE_BLOCKED[asset.usedBy]
            : "This image cannot be deleted while it is still in use.",
      );
      return;
    }
    if (!window.confirm("Delete this image from the library? This cannot be undone.")) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("csrf", csrf);
    formData.set("mediaId", asset.id);
    try {
      const result = await deleteMediaAction(null, formData);
      if (result?.ok) {
        onDeleted(asset.id);
        return;
      }
      setError(result?.message ?? "The image could not be deleted.");
    } catch {
      setError("The image could not be deleted. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <>
      {usedHere ? <p className="mt-1 text-xs text-muted">In use in this article</p> : null}
      {asset.usedBy ? <p className="mt-1 text-xs text-warning">{MEDIA_USE_LABELS[asset.usedBy]}</p> : null}
      <button
        type="button"
        disabled={pending || blocked}
        onClick={() => void remove()}
        className="mt-1 text-left text-xs font-medium text-danger disabled:opacity-50"
      >
        {pending ? "Deleting…" : blocked ? "Delete unavailable" : "Delete image"}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
