import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ButtonLink } from "@/components/ui/button";
import {
  PUBLICATION_LABELS,
  REVIEW_LABELS,
  REVIEW_STATES,
  REVIEW_STATUS_LABEL,
} from "@/lib/content/guide-status";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { getHomepageContent } from "@/server/homepage";
import {
  GUIDE_PAGE_SIZE_DEFAULT,
  listGuides,
  normaliseGuideListQuery,
  type GuideListQuery,
} from "@/server/guides/queries";

export const metadata: Metadata = { title: "Articles" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function hrefFor(query: GuideListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.authorId) params.set("authorId", query.authorId);
  if (query.reviewState) params.set("reviewState", query.reviewState);
  if (query.status) params.set("status", query.status);
  if (query.pageSize !== GUIDE_PAGE_SIZE_DEFAULT) params.set("pageSize", String(query.pageSize));
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/guides?${qs}` : "/admin/guides";
}

const selectClass = "rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm";

export default async function GuidesAdminPage({ searchParams }: Props) {
  const session = await requireSession();
  const query = normaliseGuideListQuery(await searchParams);
  const db = getDb();
  const [result, homepage] = await Promise.all([listGuides(db, session.user, query), getHomepageContent(db)]);
  const categoryNames = homepage.categories;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const canCreate = can(session.user, "guide.create");

  return (
    <>
      <AdminPageHeader
        title="Articles"
        description="Drafts stay off the public site until an approved revision is published. Authors see only their own articles."
        actions={
          canCreate ? (
            <>
              <ButtonLink href="/admin/guides/import" variant="secondary">
                Import Word document
              </ButtonLink>
              <ButtonLink href="/admin/guides/new">Create Article</ButtonLink>
            </>
          ) : null
        }
      />
      <Form action="/admin/guides" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="guide-q" className="mb-1 block text-sm font-medium">
            Search title or address
          </label>
          <input
            id="guide-q"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            maxLength={100}
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="guide-category" className="mb-1 block text-sm font-medium">
            Category
          </label>
          <select
            id="guide-category"
            name="category"
            defaultValue={query.category ?? ""}
            className={selectClass}
          >
            <option value="">All categories</option>
            {categoryNames.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        {result.authors.length > 0 ? (
          <div>
            <label htmlFor="guide-author" className="mb-1 block text-sm font-medium">
              Author
            </label>
            <select
              id="guide-author"
              name="authorId"
              defaultValue={query.authorId ?? ""}
              className={selectClass}
            >
              <option value="">All authors</option>
              {result.authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="guide-review" className="mb-1 block text-sm font-medium">
            {REVIEW_STATUS_LABEL}
          </label>
          <select
            id="guide-review"
            name="reviewState"
            defaultValue={query.reviewState ?? ""}
            className={selectClass}
          >
            <option value="">Any review status</option>
            {REVIEW_STATES.map((state) => (
              <option key={state} value={state}>
                {REVIEW_LABELS[state]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="guide-status" className="mb-1 block text-sm font-medium">
            Publication
          </label>
          <select id="guide-status" name="status" defaultValue={query.status ?? ""} className={selectClass}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="unpublished_edits">Unpublished edits</option>
          </select>
        </div>
        <div>
          <label htmlFor="guide-page-size" className="mb-1 block text-sm font-medium">
            Per page
          </label>
          <select
            id="guide-page-size"
            name="pageSize"
            defaultValue={String(query.pageSize)}
            className={selectClass}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white">
            Apply filters
          </button>
        </div>
      </Form>

      <p className="mb-4 text-sm text-muted">
        {result.total} {result.total === 1 ? "article" : "articles"}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
          No articles match these filters.
        </p>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((guide) => (
            <li key={guide.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-sans text-base font-semibold tracking-normal">
                    <Link href={`/admin/guides/${guide.id}`} className="underline-offset-2 hover:underline">
                      {guide.title}
                    </Link>
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted">/{guide.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium">
                    {PUBLICATION_LABELS[guide.publication]}
                  </span>
                  <span className="rounded-full bg-oak-pale px-2 py-0.5 text-xs font-medium text-oak-deep">
                    {REVIEW_LABELS[guide.reviewState]}
                  </span>
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Category</dt>
                  <dd>
                    {guide.category
                      ? categoryNames.find((item) => item.slug === guide.category)?.name
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Author</dt>
                  <dd>{guide.authorName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Updated</dt>
                  <dd>
                    <time dateTime={guide.updatedAt.toISOString()}>{formatDateTime(guide.updatedAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Revision</dt>
                  <dd>
                    {guide.revisionNumber ?? "—"} · version {guide.version}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  href={`/admin/guides/${guide.id}`}
                  className="text-oak-deep underline underline-offset-2"
                >
                  Edit
                </Link>
                <Link
                  href={`/admin/guides/${guide.id}/preview`}
                  className="text-oak-deep underline underline-offset-2"
                >
                  Preview
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3 text-sm">
          {result.page > 1 ? (
            <Link href={hrefFor(query, result.page - 1)} rel="prev" className="underline underline-offset-2">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p>
            Page {result.page} of {totalPages}
          </p>
          {result.page < totalPages ? (
            <Link href={hrefFor(query, result.page + 1)} rel="next" className="underline underline-offset-2">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
