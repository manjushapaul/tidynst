import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { formatDateTime } from "@/lib/format";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { REVISION_LIST_LIMIT, listRevisions } from "@/server/guides/queries";

export const metadata: Metadata = { title: "Article Revision History" };

const REASON_LABEL = { created: "Created", saved: "Saved", restored: "Restored" } as const;

type Props = { params: Promise<{ id: string }> };

export default async function RevisionsPage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  const history = await listRevisions(getDb(), session.user, id);
  if (!history) notFound();

  return (
    <>
      <AdminPageHeader
        title="Article Revision History"
        description={history.title}
        actions={
          <Link href={`/admin/guides/${id}`} className="text-sm text-oak-deep underline underline-offset-2">
            Back to editor
          </Link>
        }
      />
      {history.truncated ? (
        <p className="mb-4 text-sm text-muted">Showing the latest {REVISION_LIST_LIMIT} revisions.</p>
      ) : null}
      <ol className="grid gap-3">
        {history.items.map((revision) => (
          <li key={revision.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-sans text-base font-semibold tracking-normal">
                <Link
                  href={`/admin/guides/${id}/revisions/${revision.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  Revision {revision.revisionNumber}
                </Link>
              </h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {revision.current ? (
                  <span className="rounded-full bg-oak-pale px-2 py-0.5 font-medium text-oak-deep">
                    Current draft
                  </span>
                ) : null}
                {revision.published ? (
                  <span className="rounded-full bg-sand px-2 py-0.5 font-medium">Published</span>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">
              {REASON_LABEL[revision.reason]}
              {revision.restoredFromNumber ? ` from revision ${revision.restoredFromNumber}` : ""} by{" "}
              {revision.authorName} ·{" "}
              <time dateTime={revision.createdAt.toISOString()}>{formatDateTime(revision.createdAt)}</time>
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
