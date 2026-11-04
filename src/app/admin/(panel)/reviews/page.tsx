import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Pagination } from "@/components/admin/pagination";
import { PUBLICATION_LABELS, REVIEW_LABELS } from "@/lib/content/guide-status";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import {
  listReviewQueue,
  normaliseReviewQueueQuery,
  REVIEW_QUEUE_STATES,
  type ReviewQueueState,
} from "@/server/guides/review-queries";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Content review" };

const TAB_LABELS: Record<ReviewQueueState, string> = {
  in_review: "Waiting for review",
  changes_requested: "Changes requested",
  approved: "Approved, not live",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function hrefFor(state: ReviewQueueState, page = 1): string {
  const params = new URLSearchParams();
  if (state !== "in_review") params.set("state", state);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/reviews?${qs}` : "/admin/reviews";
}

export default async function ReviewQueuePage({ searchParams }: Props) {
  const session = await requireSession();
  if (!can(session.user, "guide.review")) return <AccessDenied />;
  const query = normaliseReviewQueueQuery(await searchParams);
  const result = await listReviewQueue(getDb(), session.user, query);
  if (!result) return <AccessDenied />;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <AdminPageHeader
        title="Content review"
        description="Approvals apply to one exact saved revision. Any later change makes the approval stale and the article must be submitted again."
      />
      <nav aria-label="Review status" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {REVIEW_QUEUE_STATES.map((state) => (
            <li key={state}>
              <Link
                href={hrefFor(state)}
                aria-current={state === query.state ? "page" : undefined}
                className={cn(
                  "inline-block rounded-full border px-3 py-1.5 text-sm",
                  state === query.state
                    ? "border-oak bg-oak-pale font-medium text-oak-deep"
                    : "border-line-strong bg-surface",
                )}
              >
                {TAB_LABELS[state]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mb-4 text-sm text-muted">
        {result.total} {result.total === 1 ? "article" : "articles"}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
          Nothing here right now.
        </p>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="min-w-0 font-sans text-base font-semibold tracking-normal">
                  <Link href={`/admin/reviews/${item.id}`} className="underline-offset-2 hover:underline">
                    {item.title}
                  </Link>
                </h2>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium">
                    {PUBLICATION_LABELS[item.publication]}
                  </span>
                  <span className="rounded-full bg-oak-pale px-2 py-0.5 text-xs font-medium text-oak-deep">
                    {REVIEW_LABELS[item.reviewState]}
                  </span>
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">Author</dt>
                  <dd>{item.authorName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Revision</dt>
                  <dd>{item.revisionNumber ? `#${item.revisionNumber}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Submitted</dt>
                  <dd>
                    {item.submittedAt ? (
                      <>
                        <time dateTime={item.submittedAt.toISOString()}>
                          {formatDateTime(item.submittedAt)}
                        </time>
                        {item.submitterName ? ` by ${item.submitterName}` : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} totalPages={totalPages} hrefFor={(page) => hrefFor(query.state, page)} />
    </>
  );
}
