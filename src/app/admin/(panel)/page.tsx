import type { Metadata } from "next";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { formatDateTime } from "@/lib/format";
import { dashboardStats, recentActivity } from "@/server/admin/dashboard";
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

const ACTION_LABELS: Record<string, string> = {
  "auth.login_succeeded": "signed in",
  "auth.login_failed": "failed to sign in",
  "auth.login_rate_limited": "was rate limited at sign-in",
  "auth.logout": "signed out",
  "auth.session_revoked": "signed out a session",
  "auth.password_changed": "changed their password",
  "user.owner_created": "created the owner account",
  "user.created": "added a user",
  "user.role_changed": "changed a user’s role",
  "user.disabled": "disabled a user",
  "user.enabled": "re-enabled a user",
};

function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/^[a-z]+\./, "").replaceAll("_", " ");
}

export default async function DashboardPage() {
  const { user } = await requireSession();
  const db = getDb();
  const [stats, activity] = await Promise.all([dashboardStats(db, user), recentActivity(db, user)]);

  return (
    <>
      <AdminPageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={
          stats.scope === "own"
            ? "Counts below include only the guides you created."
            : "A live overview of the content in the database."
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard title="Guides">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Total" value={stats.guides.total} />
            <Stat label="Published" value={stats.guides.published} />
            <Stat label="Never published" value={stats.guides.drafts} />
            <Stat
              label="Unpublished changes"
              value={stats.guides.unpublishedChanges}
              hint="Published guides with newer saved edits"
            />
          </dl>
        </AdminCard>

        <AdminCard title="Review">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Awaiting review" value={stats.review.inReview} />
            <Stat label="Changes requested" value={stats.review.changesRequested} />
            <Stat label="Approved, not yet published" value={stats.review.approvedNotPublished} />
            <Stat label="Media files" value={stats.media} />
          </dl>
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
                      <span className="text-muted">{describeAction(event.action)}</span>
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
