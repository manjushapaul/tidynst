import type { Metadata } from "next";
import Link from "next/link";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { describeAuditAction } from "@/lib/audit-actions";
import { formatBytes, formatDateTime } from "@/lib/format";
import { pageViewReport } from "@/server/analytics/page-views";
import { dashboardStats, recentActivity, storageOverview } from "@/server/admin/dashboard";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-canvas px-4 py-3.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

function StorageStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-canvas px-4 py-3.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tracking-tight tabular-nums">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const { user } = await requireSession();
  const db = getDb();
  const [stats, activity, storage, traffic] = await Promise.all([
    dashboardStats(db, user),
    recentActivity(db, user),
    storageOverview(db),
    pageViewReport(db, user),
  ]);

  const diskUsedRatio =
    storage.disk && storage.disk.totalBytes > 0
      ? Math.min(1, Math.max(0, 1 - storage.disk.freeBytes / storage.disk.totalBytes))
      : null;

  return (
    <>
      <AdminPageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={
          stats.scope === "own"
            ? "Counts below include only the articles you created."
            : "A live overview of the content in the database."
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard title="Articles">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Total" value={stats.guides.total} />
            <Stat label="Published" value={stats.guides.published} />
            <Stat label="Never published" value={stats.guides.drafts} />
            <Stat
              label="Unpublished changes"
              value={stats.guides.unpublishedChanges}
              hint="Published articles with newer saved edits"
            />
          </dl>
        </AdminCard>

        <AdminCard title="Content review">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Awaiting review" value={stats.review.inReview} />
            <Stat label="Changes requested" value={stats.review.changesRequested} />
            <Stat label="Approved, not yet published" value={stats.review.approvedNotPublished} />
            <Stat label="Media files" value={stats.media} />
          </dl>
        </AdminCard>

        <AdminCard title="Storage">
          <dl className="grid grid-cols-2 gap-3">
            <StorageStat
              label="Database used"
              value={formatBytes(storage.databaseBytes)}
              hint="Articles, revisions, images and indexes"
            />
            <StorageStat
              label="Images used"
              value={formatBytes(storage.mediaBytes)}
              hint={
                storage.mediaFiles === 1
                  ? "1 library file (optimised size; max 5 MB upload)"
                  : `${storage.mediaFiles} library files (optimised sizes; max 5 MB upload)`
              }
            />
            {storage.disk ? (
              <>
                <StorageStat
                  label="Disk free"
                  value={formatBytes(storage.disk.freeBytes)}
                  hint={`Of ${formatBytes(storage.disk.totalBytes)} on this server`}
                />
                <StorageStat
                  label="Disk used"
                  value={`${Math.round(diskUsedRatio! * 100)}%`}
                  hint="Share of the volume already taken"
                />
              </>
            ) : (
              <div className="col-span-2 rounded-xl bg-canvas px-4 py-3.5">
                <dt className="text-xs font-medium text-muted">Disk free</dt>
                <dd className="mt-1 text-sm text-muted">
                  Not available for this database host. Watch the database and image figures as you add
                  articles and uploads.
                </dd>
              </div>
            )}
          </dl>
          {storage.disk && diskUsedRatio !== null ? (
            <div className="mt-4">
              <div
                className="h-2 overflow-hidden rounded-full bg-line"
                role="meter"
                aria-label="Disk used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(diskUsedRatio * 100)}
              >
                <div
                  className="h-full rounded-full bg-oak transition-[width] duration-500 ease-(--ease-gentle)"
                  style={{ width: `${Math.max(diskUsedRatio * 100, diskUsedRatio > 0 ? 0.5 : 0)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                New images are stored in Vercel Blob; the database keeps metadata. Leave headroom on disk for
                Postgres — a full volume stops publishes and other writes.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted">
              New images go to Vercel Blob (uploads up to 5 MB). Image totals above are optimised file sizes
              recorded in the database; articles and revisions still grow the database itself.
            </p>
          )}
        </AdminCard>

        {stats.products || stats.users ? (
          <AdminCard title="Catalogue and team">
            <dl className="grid grid-cols-2 gap-3">
              {stats.products ? (
                <>
                  <Stat label="Active products" value={stats.products.active} />
                  <Stat label="All products" value={stats.products.total} />
                </>
              ) : null}
              {stats.users ? (
                <>
                  <Stat label="Active users" value={stats.users.active} />
                  <Stat label="Disabled users" value={stats.users.disabled} />
                </>
              ) : null}
            </dl>
          </AdminCard>
        ) : null}

        {traffic ? (
          <AdminCard title="Traffic">
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Page views today" value={traffic.today} />
              <Stat label="Last 30 days" value={traffic.last30Days} hint="Public pages only" />
            </dl>
            <p className="mt-4 text-sm">
              <Link href="/admin/traffic" className="text-oak-deep underline-offset-2 hover:underline">
                See views by page
              </Link>
            </p>
          </AdminCard>
        ) : null}
        {activity ? (
          <AdminCard title="Recent activity">
            {activity.length === 0 ? (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ol className="divide-y divide-line text-sm">
                {activity.map((event) => (
                  <li key={event.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {event.actorName ?? (event.action.startsWith("auth.") ? "Someone" : "System")}
                      </span>{" "}
                      <span className="text-muted">{describeAuditAction(event.action)}</span>
                    </span>
                    <time dateTime={event.createdAt.toISOString()} className="shrink-0 text-xs text-muted">
                      {formatDateTime(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </AdminCard>
        ) : null}
      </div>
    </>
  );
}
