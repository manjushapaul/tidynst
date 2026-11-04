import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ArticleWorkflowPanel } from "@/components/admin/article-workflow-panel";
import { GuideEditor } from "@/components/admin/guide-editor";
import { PUBLICATION_LABELS, REVIEW_LABELS } from "@/lib/content/guide-status";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import {
  getEditableGuide,
  listEditorProducts,
  listEditorTopics,
  listRecentMedia,
} from "@/server/guides/queries";
import { getHomepageContent } from "@/server/homepage";
import { listLinkTargets } from "@/server/link-targets";
import { groupIdForSubcategory, listSubcategoryChoices } from "@/server/subcategories";
import { deleteGuideAction, saveGuideAction } from "../actions";
export const metadata: Metadata = { title: "Edit Article" };

type Props = { params: Promise<{ id: string }> };

export default async function EditGuidePage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  const db = getDb();
  const guide = await getEditableGuide(db, session.user, id);
  if (!guide) notFound();
  const subcategoryGroupId =
    guide.content.subcategoryGroupId ?? (await groupIdForSubcategory(db, guide.content.subcategoryId));
  const [topics, products, media, homepage, subcategoryChoices] = await Promise.all([
    listEditorTopics(db),
    listEditorProducts(db),
    listRecentMedia(db, guide.content.featuredImageId, guide.id),
    getHomepageContent(db),
    listSubcategoryChoices(db),
  ]);
  const allLinkTargets = await listLinkTargets(db, homepage.categories);
  const linkTargets = {
    ...allLinkTargets,
    articles: allLinkTargets.articles.filter((article) => article.id !== guide.id),
  };

  return (
    <>
      <AdminPageHeader
        title={guide.content.title}
        description="Save draft keeps your working copy. It never changes the published revision."
        actions={
          <>
            <Link
              href={`/admin/guides/${guide.id}/preview`}
              className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm"
            >
              Preview
            </Link>
            <Link
              href={`/admin/guides/${guide.id}/revisions`}
              className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm"
            >
              History
            </Link>
          </>
        }
      />
      <p className="mb-6 flex flex-wrap gap-2 text-sm text-muted">
        <span>{PUBLICATION_LABELS[guide.publication]}</span>
        <span aria-hidden="true">·</span>
        <span>{REVIEW_LABELS[guide.reviewState]}</span>
        <span aria-hidden="true">·</span>
        <span>Version {guide.version}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={guide.updatedAt.toISOString()}>Updated {formatDateTime(guide.updatedAt)}</time>
      </p>
      <ArticleWorkflowPanel guide={guide} actor={session.user} csrf={session.csrfToken} />
      <GuideEditor
        csrf={session.csrfToken}
        action={saveGuideAction}
        mode="edit"
        guideId={guide.id}
        initial={{ ...guide.content, subcategoryGroupId }}
        version={guide.version}
        everPublished={guide.everPublished}
        topics={topics}
        products={products}
        media={media}
        canDeleteMedia={can(session.user, "media.delete")}
        categoryChoices={homepage.categories}
        subcategoryChoices={subcategoryChoices}
        linkTargets={linkTargets}
      />
      {guide.deletable && !guide.everPublished ? (
        <div className="mt-10 border-t border-line pt-6">
          <h2 className="font-sans text-sm font-semibold tracking-normal">Delete draft</h2>
          <p className="mt-1 mb-3 max-w-xl text-sm text-muted">
            This article has never been published. Deleting it removes the draft and its revision history.
            Images in the library are kept.
          </p>
          <ActionForm
            action={deleteGuideAction}
            csrf={session.csrfToken}
            hidden={{ guideId: guide.id }}
            label="Delete draft"
            pendingLabel="Deleting…"
            variant="danger"
            confirm={`Delete “${guide.content.title}”? This cannot be undone.`}
          />
        </div>
      ) : null}
    </>
  );
}
