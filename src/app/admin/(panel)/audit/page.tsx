import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Pagination } from "@/components/admin/pagination";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  describeAuditAction,
  type AuditEntityType,
} from "@/lib/audit-actions";
import { formatDateTime } from "@/lib/format";
import {
  auditEntityHref,
  type AuditQuery,
  listAuditEvents,
  normaliseAuditQuery,
} from "@/server/admin/audit-log";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Audit Log" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function hrefFor(query: AuditQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.action) params.set("action", query.action);
  if (query.actorId) params.set("actorId", query.actorId);
  if (query.entityType) params.set("entityType", query.entityType);
  if (query.entityId) params.set("entityId", query.entityId);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/audit?${qs}` : "/admin/audit";
}

const fieldClass = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm";

function entityLabel(type: string | null): string {
  return type && type in AUDIT_ENTITY_LABELS ? AUDIT_ENTITY_LABELS[type as AuditEntityType] : (type ?? "—");
}

export default async function AuditLogPage({ searchParams }: Props) {
  const session = await requireSession();
  if (!can(session.user, "audit.view")) return <AccessDenied />;
  const query = normaliseAuditQuery(await searchParams);
  const result = await listAuditEvents(getDb(), session.user, query);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <AdminPageHeader
        title="Audit Log"
        description="A read-only record of sign-ins, content, review, publishing, product and media changes. Dates use India time. Sensitive details are never shown."
      />
      <Form action="/admin/audit" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {query.entityId ? <input type="hidden" name="entityId" value={query.entityId} /> : null}
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-sm font-medium">
            Action
          </label>
          <select id="audit-action" name="action" defaultValue={query.action ?? ""} className={fieldClass}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action} ({AUDIT_ACTION_LABELS[action]})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-actor" className="mb-1 block text-sm font-medium">
            Person
          </label>
          <select id="audit-actor" name="actorId" defaultValue={query.actorId ?? ""} className={fieldClass}>
            <option value="">Anyone</option>
            {result.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-entity" className="mb-1 block text-sm font-medium">
            Type
          </label>
          <select
            id="audit-entity"
            name="entityType"
            defaultValue={query.entityType ?? ""}
            className={fieldClass}
          >
            <option value="">All types</option>
            {AUDIT_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {AUDIT_ENTITY_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-sm font-medium">
            From
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={query.from ?? ""}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-sm font-medium">
            To
          </label>
          <input id="audit-to" name="to" type="date" defaultValue={query.to ?? ""} className={fieldClass} />
        </div>
        <div className="flex items-end gap-3">
          <button type="submit" className="rounded-full bg-oak px-4 py-2 text-sm font-medium text-white">
            Apply filters
          </button>
          <Link href="/admin/audit" className="text-sm underline underline-offset-2">
            Clear
          </Link>
        </div>
      </Form>

      {query.entityType && query.entityId ? (
        <p className="mb-2 text-sm break-all">
          Only showing one {entityLabel(query.entityType).toLowerCase()}: <code>{query.entityId}</code>.{" "}
          <Link
            href={hrefFor({ ...query, entityId: undefined }, 1)}
            className="whitespace-nowrap underline underline-offset-2"
          >
            Show all {entityLabel(query.entityType).toLowerCase()} events
          </Link>
        </p>
      ) : null}
      <p className="mb-4 text-sm text-muted">
        {result.total} {result.total === 1 ? "event" : "events"}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
          No events match these filters.
        </p>
      ) : (
        <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
          {result.items.map((event) => {
            const href = auditEntityHref(session.user, event.entityType, event.entityId);
            return (
              <li
                key={event.id}
                className="grid gap-1 p-4 text-sm sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
              >
                <time dateTime={event.createdAt.toISOString()} className="text-xs text-muted">
                  {formatDateTime(event.createdAt)}
                </time>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">
                      {event.actorName ?? (event.action.startsWith("auth.") ? "Someone" : "System")}
                    </span>{" "}
                    {describeAuditAction(event.action)}
                  </p>
                  <p className="mt-0.5 text-xs break-all text-muted">
                    <code>{event.action}</code>
                    {event.entityType ? (
                      <>
                        {" · "}
                        {entityLabel(event.entityType)}{" "}
                        {href ? (
                          <Link href={href} className="underline underline-offset-2">
                            {event.entityId}
                          </Link>
                        ) : (
                          event.entityId
                        )}
                      </>
                    ) : null}
                  </p>
                  {event.details.length > 0 ? (
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {event.details.map((detail) => (
                        <div key={detail.label} className="flex min-w-0 gap-1">
                          <dt className="text-muted">{detail.label}:</dt>
                          <dd className="break-words">{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Pagination page={result.page} totalPages={totalPages} hrefFor={(page) => hrefFor(query, page)} />
    </>
  );
}
