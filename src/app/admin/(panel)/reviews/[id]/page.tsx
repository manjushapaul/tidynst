import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/admin/access-denied";
import { ActionForm } from "@/components/admin/action-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { DiffBlock } from "@/components/admin/diff-view";
import { WorkflowForm } from "@/components/admin/workflow-form";
import { WorkflowStatusProvider, WorkflowStatusRegion } from "@/components/admin/workflow-status";
import { MarkdownContent } from "@/components/content/markdown-content";
import { categories, guidePath } from "@/content/categories";
import { describeAuditAction } from "@/lib/audit-actions";
import { diffGuideContent } from "@/lib/content/diff";
import {
  CONTENT_CHECKS_ISSUES,
  CONTENT_CHECKS_LABEL,
  CONTENT_CHECKS_PASSED,
  PUBLICATION_LABELS,
  REVIEW_LABELS,
  REVIEW_STATUS_LABEL,
} from "@/lib/content/guide-status";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { CHANGES_NOTE_MIN, REVIEW_NOTE_MAX } from "@/server/guides/review";
import { getReviewDetail } from "@/server/guides/review-queries";
import { approveReviewAction, publishGuideAction, requestChangesAction } from "../../guides/review-actions";

export const metadata: Metadata = { title: "Review Article" };

type Props = { params: Promise<{ id: string }> };

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session.user, "guide.review")) return <AccessDenied />;
  const detail = await getReviewDetail(getDb(), session.user, id);
  if (!detail) notFound();
  const { current, published } = detail;
  const target = {
    guideId: detail.id,
    version: String(detail.version),
    revisionId: current.id,
    contentHash: current.contentHash,
  };
  const diffs = published ? diffGuideContent(published.content, current.content) : [];
  const waiting = detail.reviewState === "in_review";
  const canPublish =
    can(session.user, "guide.publish") &&
    detail.reviewState === "approved" &&
    detail.publication !== "published";
  const categoryName = categories.find((item) => item.slug === current.content.category)?.name ?? "None";

  return (
    <>
      <AdminPageHeader
        title={current.content.title}
        description={`Revision #${current.number} by ${detail.authorName}. Decisions apply to this exact revision (content ${current.contentHash.slice(0, 12)}…).`}
        actions={
          <>
            <Link
              href={`/admin/guides/${detail.id}/preview`}
              className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm"
            >
              Preview
            </Link>
            <Link
              href={`/admin/guides/${detail.id}`}
              className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm"
            >
              Edit Article
            </Link>
          </>
        }
      />
      <p className="mb-6 flex flex-wrap gap-2 text-sm text-muted">
        <span>
          {REVIEW_STATUS_LABEL}: {REVIEW_LABELS[detail.reviewState]}
        </span>
        <span aria-hidden="true">·</span>
        <span>{PUBLICATION_LABELS[detail.publication]}</span>
        {detail.submission ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Submitted {formatDateTime(detail.submission.at)}
              {detail.submission.actorName ? ` by ${detail.submission.actorName}` : ""}
            </span>
          </>
        ) : null}
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <AdminCard title={CONTENT_CHECKS_LABEL}>
            {detail.publishIssues.length === 0 ? (
              <p className="text-sm text-oak-deep">
                {CONTENT_CHECKS_PASSED} Nothing in this revision blocks publishing.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-danger">
                  {CONTENT_CHECKS_ISSUES} This revision cannot be published until these are fixed:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {detail.publishIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </>
            )}
          </AdminCard>

          <AdminCard
            title={published ? `Changes since live revision #${published.number}` : "First publication"}
          >
            {!published ? (
              <p className="text-sm text-muted">
                This article has no live revision; all content below is new.
              </p>
            ) : diffs.length === 0 ? (
              <p className="text-sm text-muted">The content matches the live revision.</p>
            ) : (
              diffs.map((diff) => <DiffBlock key={diff.field} label={diff.label} ops={diff.ops} />)
            )}
          </AdminCard>

          <AdminCard title="Content">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Address</dt>
                <dd>{guidePath(current.content)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Category</dt>
                <dd>{categoryName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Summary</dt>
                <dd>{current.content.excerpt || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Meta description</dt>
                <dd>{current.content.seoDescription ?? "Uses the summary"}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
              <MarkdownContent markdown={current.content.body} className="prose-tn max-w-none" />
            </div>
            {current.content.faqs.length ? (
              <div className="mt-4">
                <h3 className="font-sans text-sm font-semibold tracking-normal">FAQ</h3>
                <dl className="mt-2 space-y-3 text-sm">
                  {current.content.faqs.map((faq, index) => (
                    <div key={index}>
                      <dt className="font-medium">{faq.question}</dt>
                      <dd className="mt-1 whitespace-pre-line text-muted">{faq.answer}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </AdminCard>
        </div>

        <WorkflowStatusProvider resetKey={current.contentHash}>
          <div className="space-y-6">
            <WorkflowStatusRegion />
            {waiting ? (
              <AdminCard title="Decision">
                {detail.canApprove ? (
                  <div className="mb-6">
                    {detail.ownWork ? (
                      <p className="mb-3 rounded-xl bg-sand/60 p-3 text-xs">
                        You wrote or submitted this article. As the owner you may approve it yourself; the
                        audit log records it as a self-approval.
                      </p>
                    ) : null}
                    <WorkflowForm
                      action={approveReviewAction}
                      csrf={session.csrfToken}
                      hidden={target}
                      label="Approve revision"
                      pendingLabel="Approving…"
                      variant="primary"
                      note={{ name: "notes", label: "Note (optional)", maxLength: REVIEW_NOTE_MAX }}
                    />
                  </div>
                ) : (
                  <p className="mb-6 text-sm text-muted">
                    You wrote or submitted this article, so another editor or the owner must approve it. You
                    can still request changes.
                  </p>
                )}
                <WorkflowForm
                  action={requestChangesAction}
                  csrf={session.csrfToken}
                  hidden={target}
                  label="Request changes"
                  pendingLabel="Sending…"
                  note={{
                    name: "notes",
                    label: "What needs to change",
                    hint: `Required, at least ${CHANGES_NOTE_MIN} characters. The author sees this note.`,
                    required: true,
                    maxLength: REVIEW_NOTE_MAX,
                  }}
                />
              </AdminCard>
            ) : (
              <AdminCard title="Decision">
                <p className="text-sm text-muted">
                  {detail.reviewState === "approved"
                    ? "This revision is approved."
                    : "This article is not waiting for review."}
                </p>
                {canPublish ? (
                  <ActionForm
                    action={publishGuideAction}
                    csrf={session.csrfToken}
                    hidden={target}
                    label="Publish article"
                    pendingLabel="Publishing…"
                    variant="primary"
                    confirm={`Publish revision #${current.number} to the public site?`}
                    className="mt-4"
                  />
                ) : null}
              </AdminCard>
            )}

            <AdminCard title="Review history">
              {detail.history.length === 0 ? (
                <p className="text-sm text-muted">No review activity yet.</p>
              ) : (
                <ol className="space-y-4 text-sm">
                  {detail.history.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`} className="border-l-2 border-line pl-3">
                      <p>
                        <span className="font-medium">{entry.actorName ?? "System"}</span>{" "}
                        {entry.kind === "decision"
                          ? entry.decision === "approved"
                            ? "approved"
                            : "requested changes"
                          : describeAuditAction(entry.action)}
                        {entry.revisionNumber ? ` · revision #${entry.revisionNumber}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        <time dateTime={entry.at.toISOString()}>{formatDateTime(entry.at)}</time>
                        {entry.kind === "decision" ? ` · content ${entry.contentHash.slice(0, 12)}…` : ""}
                      </p>
                      {entry.kind === "decision" && entry.notes ? (
                        <p className="mt-1 whitespace-pre-line">{entry.notes}</p>
                      ) : null}
                      {entry.kind === "event" && entry.reason ? (
                        <p className="mt-1 whitespace-pre-line">Reason: {entry.reason}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </AdminCard>
          </div>
        </WorkflowStatusProvider>
      </div>
    </>
  );
}
