import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { AccessDenied } from "@/components/admin/access-denied";
import { formatDate } from "@/lib/format";
import { can, ROLE_LABELS } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { listUsers } from "@/server/users";
import { changeRoleAction, setDisabledAction } from "./actions";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await requireSession();
  if (!can(session.user, "user.manage")) return <AccessDenied />;
  const people = await listUsers(getDb(), session.user);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Only owners can manage accounts. Changing a role or disabling a user signs them out everywhere."
      />
      <div className="space-y-6">
        <AdminCard title="Team">
          <ul className="divide-y divide-line">
            {people.map((person) => {
              const self = person.id === session.user.id;
              return (
                <li
                  key={person.id}
                  className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {person.name}
                      {self ? <span className="ml-2 text-xs font-normal text-muted">(you)</span> : null}
                      {person.disabledAt ? (
                        <span className="ml-2 rounded-full bg-danger-pale px-2 py-0.5 text-xs font-medium text-danger">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {person.email} · {ROLE_LABELS[person.role]} · added {formatDate(person.createdAt)}
                    </p>
                  </div>
                  {self ? null : (
                    <div className="flex flex-wrap items-center gap-3">
                      <ActionForm
                        action={changeRoleAction}
                        csrf={session.csrfToken}
                        hidden={{ userId: person.id }}
                        label="Change role"
                        pendingLabel="Saving…"
                      >
                        <label className="sr-only" htmlFor={`role-${person.id}`}>
                          Role for {person.name}
                        </label>
                        <select
                          id={`role-${person.id}`}
                          name="role"
                          defaultValue={person.role}
                          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm"
                        >
                          <option value="author">Author</option>
                          <option value="editor">Editor</option>
                          <option value="owner">Owner</option>
                        </select>
                      </ActionForm>
                      <ActionForm
                        action={setDisabledAction}
                        csrf={session.csrfToken}
                        hidden={{ userId: person.id, disabled: person.disabledAt ? "false" : "true" }}
                        label={person.disabledAt ? "Re-enable" : "Disable"}
                        variant={person.disabledAt ? "secondary" : "danger"}
                        confirm={person.disabledAt ? undefined : `Disable ${person.name} and sign them out?`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </AdminCard>
        <AdminCard title="Add a user">
          <CreateUserForm csrf={session.csrfToken} />
        </AdminCard>
      </div>
    </>
  );
}
