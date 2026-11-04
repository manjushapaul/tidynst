export const REVIEW_STATES = ["not_requested", "in_review", "changes_requested", "approved"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_LABELS: Record<ReviewState, string> = {
  not_requested: "Not submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/** Field name for the human review decision. Approval is not an automated check result. */
export const REVIEW_STATUS_LABEL = "Review status";

/**
 * Editor-facing name for the automated publication checks (length, headings, links, topics,
 * images and active products). These checks do not approve an article.
 */
export const CONTENT_CHECKS_LABEL = "Content checks";
export const CONTENT_CHECKS_PASSED = "Checks passed.";
export const CONTENT_CHECKS_ISSUES = "Issues found.";

export type PublicationState = "draft" | "published" | "unpublished_edits";

export const PUBLICATION_LABELS: Record<PublicationState, string> = {
  draft: "Draft",
  published: "Published",
  unpublished_edits: "Unpublished edits",
};

export function publicationState(guide: {
  publishedRevisionId: string | null;
  currentRevisionId: string | null;
}): PublicationState {
  if (!guide.publishedRevisionId) return "draft";
  if (guide.currentRevisionId !== guide.publishedRevisionId) return "unpublished_edits";
  return "published";
}
