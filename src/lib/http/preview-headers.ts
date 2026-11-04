/** Response headers for authenticated draft preview. Not used by public routes. */
export const DRAFT_PREVIEW_CACHE_CONTROL = "private, no-store";
export const DRAFT_PREVIEW_ROBOTS = "noindex, nofollow, noarchive";

export const draftPreviewHeaders: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Cache-Control", value: DRAFT_PREVIEW_CACHE_CONTROL },
  { key: "X-Robots-Tag", value: DRAFT_PREVIEW_ROBOTS },
];
