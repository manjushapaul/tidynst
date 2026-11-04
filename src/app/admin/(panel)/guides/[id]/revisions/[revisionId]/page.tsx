import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DiffBlock } from "@/components/admin/diff-view";
import { MarkdownContent } from "@/components/content/markdown-content";
import { diffGuideContent } from "@/lib/content/diff";
import { formatDateTime } from "@/lib/format";
import { canEditGuide } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { getRevisionComparison } from "@/server/guides/queries";
import { restoreGuideAction } from "../../../actions";

export const metadata: Metadata = { title: "Revision" };

const REASON_LABEL = { created: "Created", saved: "Saved", restored: "Restored" } as const;

type Props = { params: Promise<{ id: string; revisionId: string }> };

export default async function RevisionPage({ params }: Props) {
  const { id, revisionId } = await params;
  const session = await requireSession();
  const comparison = await getRevisionComparison(getDb(), session.user, id, revisionId);
  if (!comparison) notFound();
  const { revision, working, guide } = comparison;
  const diffs = diffGuideContent(revision.content, working);
  const editable = canEditGuide(session.user, guide);

  return (
    <>
      <AdminPageHeader
        title={`Revision ${revision.revisionNumber}`}
        description={`${REASON_LABEL[revision.reason]} by ${revision.authorName} on ${formatDateTime(revision.createdAt)}. This snapshot is read-only.`}
        actions={
          <Link
            href={`/admin/guides/${guide.id}/revisions`}
            className="text-sm text-oak-deep underline underline-offset-2"
          >
            All revisions
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        {revision.current ? (
          <span className="rounded-full bg-oak-pale px-2 py-0.5 font-medium text-oak-deep">
            Current draft
          </span>
        ) : null}
        {revision.published ? (
          <span className="rounded-full bg-sand px-2 py-0.5 font-medium">Published</span>
        ) : null}
      </div>

      {!revision.current && editable ? (
        <ActionForm
          action={restoreGuideAction}
          csrf={session.csrfToken}
          hidden={{ guideId: guide.id, revisionId: revision.id, version: String(guide.version) }}
          label="Restore as new revision"
          pendingLabel="Restoring…"
          confirm="Restore this revision as a new draft? The published article will not change, and this historical revision stays as it is."
          className="mb-8"
        />
      ) : null}

      <section aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading" className="font-sans text-base font-semibold tracking-normal">
          Snapshot
        </h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Title</dt>
            <dd>{revision.content.title}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Address</dt>
            <dd>{revision.content.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Summary</dt>
            <dd>{revision.content.excerpt || "—"}</dd>
          </div>
        </dl>
        <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
          <MarkdownContent markdown={revision.content.body} className="prose-tn max-w-none" />
        </div>
      </section>

      <section aria-labelledby="diff-heading" className="mt-10">
        <h2 id="diff-heading" className="font-sans text-base font-semibold tracking-normal">
          Changes since this revision
        </h2>
        <p className="mt-1 text-sm text-muted">
          Compared with the current draft. Removed lines are from this revision; added lines are in the draft.
        </p>
        {diffs.length === 0 ? (
          <p className="mt-4 text-sm text-muted">This revision matches the current draft.</p>
        ) : (
          diffs.map((diff) => <DiffBlock key={diff.field} label={diff.label} ops={diff.ops} />)
        )}
      </section>
    </>
  );
}
