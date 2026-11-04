import Link from "next/link";
import { PUBLICATION_LABELS, REVIEW_LABELS, REVIEW_STATUS_LABEL } from "@/lib/content/guide-status";
import { formatDateTime } from "@/lib/format";
import {
  approveReviewAction,
  publishGuideAction,
  submitForReviewAction,
  unpublishGuideAction,
} from "@/app/admin/(panel)/guides/review-actions";
import { deleteGuideAction } from "@/app/admin/(panel)/guides/actions";
import { type Actor, can } from "@/server/auth/permissions";
import type { EditableGuide } from "@/server/guides/queries";
import { REVIEW_NOTE_MAX, UNPUBLISH_REASON_MAX } from "@/server/guides/review";
import { ActionForm } from "./action-form";
import { WorkflowForm } from "./workflow-form";
import { WorkflowStatusProvider, WorkflowStatusRegion } from "./workflow-status";

/** Review and publication controls shown above the article editor. */
export function ArticleWorkflowPanel({
  guide,
  actor,
  csrf,
}: {
  guide: EditableGuide;
  actor: Actor;
  csrf: string;
}) {
  const target = guide.currentRevisionId
    ? {
        guideId: guide.id,
        version: String(guide.version),
        revisionId: guide.currentRevisionId,
        contentHash: guide.contentHash,
      }
    : null;
  const canSubmit =
    target &&
    can(actor, "guide.submit") &&
    ["not_requested", "changes_requested"].includes(guide.reviewState);
  const canPublish =
    target && can(actor, "guide.publish") && guide.approvalCurrent && guide.publication !== "published";
  const changes =
    guide.reviewState === "changes_requested" && guide.latestReview?.decision === "changes_requested";
  const ownerSelfReview = actor.role === "owner" && guide.reviewState === "in_review";

  return (
    <WorkflowStatusProvider resetKey={guide.contentHash}>
      <section
        aria-labelledby="workflow-heading"
        className="mb-8 rounded-(--radius-card) border border-line bg-surface p-5 sm:p-6"
      >
        <h2 id="workflow-heading" className="font-sans text-base font-semibold tracking-normal">
          Review and publishing
        </h2>
        <WorkflowStatusRegion className="mt-3" />
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">{REVIEW_STATUS_LABEL}</dt>
            <dd className="font-medium">{REVIEW_LABELS[guide.reviewState]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Public site</dt>
            <dd className="font-medium">{PUBLICATION_LABELS[guide.publication]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Saved revision</dt>
            <dd>{guide.currentRevisionNumber ? `#${guide.currentRevisionNumber}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Live revision</dt>
            <dd>
              {guide.publishedRevisionNumber ? `#${guide.publishedRevisionNumber}` : "Not published"}
              {guide.publishedAt ? (
                <span className="block text-xs text-muted">since {formatDateTime(guide.publishedAt)}</span>
              ) : null}
            </dd>
          </div>
        </dl>

        {changes && guide.latestReview ? (
          <div className="mt-4 rounded-xl bg-sand/60 p-4 text-sm">
            <p className="font-medium">
              Changes requested by {guide.latestReview.reviewerName} on{" "}
              {formatDateTime(guide.latestReview.createdAt)}
              {guide.latestReview.revisionNumber ? ` (revision #${guide.latestReview.revisionNumber})` : ""}
            </p>
            {guide.latestReview.notes ? (
              <p className="mt-1 whitespace-pre-line text-ink">{guide.latestReview.notes}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-5">
          {canSubmit && target ? (
            <div>
              <p className="mb-2 text-sm text-muted">
                Submitting sends the last saved revision for review. Save any edits first; saving again later
                withdraws the submission.
              </p>
              <ActionForm
                action={submitForReviewAction}
                csrf={csrf}
                hidden={target}
                label={
                  guide.reviewState === "changes_requested" ? "Resubmit for review" : "Submit for review"
                }
                pendingLabel="Submitting…"
                variant="primary"
              />
            </div>
          ) : null}

          {guide.reviewState === "in_review" ? (
            <div className="text-sm">
              <p className="text-muted">
                Revision #{guide.currentRevisionNumber} is waiting for review. Saving a change withdraws it.
              </p>
              {can(actor, "guide.review") ? (
                <p className="mt-2">
                  <Link
                    href={`/admin/reviews/${guide.id}`}
                    className="font-medium text-oak-deep underline underline-offset-2"
                  >
                    Open the review
                  </Link>
                  {ownerSelfReview ? (
                    <span className="text-muted"> — as the owner you can approve your own article.</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {ownerSelfReview && target ? (
            <WorkflowForm
              action={approveReviewAction}
              csrf={csrf}
              hidden={target}
              label="Approve this revision"
              pendingLabel="Approving…"
              note={{ name: "notes", label: "Approval note (optional)", maxLength: REVIEW_NOTE_MAX }}
              confirm="Approve this exact revision? Any later change will need a new approval."
            />
          ) : null}

          {canPublish && target ? (
            <div>
              <p className="mb-2 text-sm text-muted">
                Approved revision #{guide.currentRevisionNumber} is ready.{" "}
                {guide.publication === "unpublished_edits"
                  ? `Publishing replaces live revision #${guide.publishedRevisionNumber}.`
                  : "Publishing makes it public."}
              </p>
              <ActionForm
                action={publishGuideAction}
                csrf={csrf}
                hidden={target}
                label="Publish article"
                pendingLabel="Publishing…"
                variant="primary"
                confirm={`Publish revision #${guide.currentRevisionNumber} to the public site?`}
              />
            </div>
          ) : null}

          {guide.reviewState === "approved" && !guide.approvalCurrent ? (
            <p className="text-sm text-danger">
              The approval no longer matches the saved content. Submit it again.
            </p>
          ) : null}

          {guide.publishedRevisionId && can(actor, "guide.publish") ? (
            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium">Unpublish article</summary>
              <p className="mt-2 mb-3 text-sm text-muted">
                The public page will return “not found” and the article leaves listings, search and the
                sitemap. The draft, address, revisions and review history are kept.
              </p>
              <WorkflowForm
                action={unpublishGuideAction}
                csrf={csrf}
                hidden={{ guideId: guide.id, publishedRevisionId: guide.publishedRevisionId }}
                label="Unpublish article"
                pendingLabel="Unpublishing…"
                variant="danger"
                note={{
                  name: "reason",
                  label: "Reason (recorded in the audit log)",
                  required: true,
                  maxLength: UNPUBLISH_REASON_MAX,
                }}
                confirmLabel="I understand this removes the article from the public site."
              />
            </details>
          ) : null}

          {guide.deletable && guide.everPublished ? (
            <div className="rounded-xl border border-danger/25 bg-danger-pale/40 p-4">
              <p className="text-sm font-medium">Delete article</p>
              <p className="mt-1 mb-3 text-sm text-muted">
                This article is no longer on the public site. Deleting it removes the article, its revision
                history and its review notes for good. Images in the library are kept.
              </p>
              <ActionForm
                action={deleteGuideAction}
                csrf={csrf}
                hidden={{ guideId: guide.id }}
                label="Delete article"
                pendingLabel="Deleting…"
                variant="danger"
                confirm={`Delete “${guide.content.title}”? This permanently removes the article and its history. This cannot be undone.`}
              />
            </div>
          ) : null}
        </div>
      </section>
    </WorkflowStatusProvider>
  );
}
