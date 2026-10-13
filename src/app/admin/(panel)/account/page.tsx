import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { listActiveSessions } from "@/server/auth/sessions";
import { getDb } from "@/server/db";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Account" };

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown browser";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}`;
}

export default async function AccountPage() {
  const session = await requireSession();
  const { user } = session;
  const activeSessions = await listActiveSessions(getDb(), user.id);
  const others = activeSessions.filter((item) => item.id !== session.id);

  return (
    <>
      <AdminPageHeader title="Account" description="Your profile, password and signed-in sessions." />
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard title="Profile">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Name</dt>
            <dd>{user.name}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{user.email}</dd>
            <dt className="text-muted">Role</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
            <dt className="text-muted">Session expires</dt>
            <dd>{formatDateTime(session.expiresAt)} (or after 4 hours of inactivity)</dd>
          </dl>
        </AdminCard>

        <AdminCard title="Change password">
          <PasswordForm csrf={session.csrfToken} />
        </AdminCard>

        <AdminCard title="Signed-in sessions" className="xl:col-span-2">
          <ul className="divide-y divide-line text-sm">
            {activeSessions.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {describeAgent(item.userAgent)}
                    {item.id === session.id ? (
                      <span className="ml-2 rounded-full bg-sage-pale px-2 py-0.5 text-xs font-medium text-sage-deep">
                        This browser
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    Signed in {formatDateTime(item.createdAt)} · last active {formatDateTime(item.lastSeenAt)}
                  </p>
                </div>
                {item.id !== session.id ? (
                  <ActionForm
                    action={revokeSessionAction}
                    csrf={session.csrfToken}
                    hidden={{ sessionId: item.id }}
                    label="Sign out"
                    pendingLabel="Signing out…"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {others.length > 0 ? (
            <ActionForm
              className="mt-4"
              action={revokeOtherSessionsAction}
              csrf={session.csrfToken}
              label="Sign out all other sessions"
              pendingLabel="Signing out…"
              variant="danger"
              confirm="Sign out every other session for your account?"
            />
          ) : (
            <p className="mt-4 text-sm text-muted">This browser is your only active session.</p>
          )}
        </AdminCard>
      </div>
    </>
  );
}
