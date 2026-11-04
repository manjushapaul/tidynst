import type { Metadata } from "next";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { ActionForm } from "@/components/admin/action-form";
import { AccessDenied } from "@/components/admin/access-denied";
import { MEDIA_DELETE_BLOCKED, MEDIA_USE_LABELS } from "@/components/admin/upload-image";
import { MediaUploader } from "@/components/admin/media-uploader";
import { formatBytes, formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { listMedia } from "@/server/guides/queries";
import { deleteMediaAction } from "./actions";

export const metadata: Metadata = { title: "Media" };

const PAGE_SIZE = 24;

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export default async function MediaPage({ searchParams }: Props) {
  const session = await requireSession();
  if (!can(session.user, "media.upload")) return <AccessDenied />;
  const raw = (await searchParams).page;
  const pageValue = Array.isArray(raw) ? raw[0] : raw;
  const page = pageValue && /^[1-9]\d{0,4}$/.test(pageValue) ? Number(pageValue) : 1;
  const result = await listMedia(getDb(), PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const canDelete = can(session.user, "media.delete");

  return (
    <>
      <AdminPageHeader
        title="Media"
        description="JPEG, PNG, WebP or AVIF, up to 5 MB. Images are optimised and stored in Vercel Blob when configured. Images still used by any draft, revision or published article cannot be deleted."
      />
      <div className="grid gap-6">
        <AdminCard title="Upload">
          <MediaUploader csrf={session.csrfToken} />
        </AdminCard>
        <AdminCard title="Library">
          {result.items.length === 0 ? (
            <p className="text-sm text-muted">No images yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((asset) => (
                <li key={asset.id} className="rounded-xl border border-line p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.src}
                    alt={asset.altText}
                    width={asset.width}
                    height={asset.height}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                  <p className="mt-2 text-sm">{asset.altText}</p>
                  <p className="mt-1 text-xs text-muted">
                    {asset.width}×{asset.height} · {formatBytes(asset.byteSize)} ·{" "}
                    <time dateTime={asset.createdAt.toISOString()}>{formatDateTime(asset.createdAt)}</time>
                  </p>
                  <p className="mt-1 font-mono text-[calc(0.7rem*var(--text-scale))] break-all text-muted">{asset.src}</p>
                  {canDelete ? (
                    <div className="mt-3">
                      {asset.usedBy ? (
                        <p className="mb-2 text-xs text-warning">{MEDIA_USE_LABELS[asset.usedBy]}</p>
                      ) : null}
                      {asset.usedBy ? (
                        <p className="text-xs text-muted">{MEDIA_DELETE_BLOCKED[asset.usedBy]}</p>
                      ) : (
                        <ActionForm
                          action={deleteMediaAction}
                          csrf={session.csrfToken}
                          hidden={{ mediaId: asset.id }}
                          label="Delete"
                          variant="danger"
                          confirm="Delete this image? This cannot be undone."
                        />
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 ? (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <a href={`/admin/media?page=${page - 1}`} className="underline underline-offset-2">
                  Previous
                </a>
              ) : (
                <span />
              )}
              <p>
                Page {page} of {totalPages}
              </p>
              {page < totalPages ? (
                <a href={`/admin/media?page=${page + 1}`} className="underline underline-offset-2">
                  Next
                </a>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </AdminCard>
      </div>
    </>
  );
}
