import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Pagination } from "@/components/admin/pagination";
import { cn } from "@/lib/cn";
import { CONTACT_TOPIC_LABELS } from "@/lib/content/contact-schema";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { listContactMessages, type MessageFilter } from "@/server/contact-messages";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Messages" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTERS: { value: MessageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "unanswered", label: "Not replied" },
];

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(filter: MessageFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("show", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/messages?${qs}` : "/admin/messages";
}

export default async function MessagesPage({ searchParams }: Props) {
  const session = await requireSession();
  if (!can(session.user, "message.manage")) return <AccessDenied />;
  const raw = await searchParams;
  const show = one(raw.show);
  const filter: MessageFilter = show === "unread" || show === "unanswered" ? show : "all";
  const pageParam = one(raw.page);
  const page = /^[1-9]\d{0,3}$/.test(pageParam) ? Number(pageParam) : 1;
  const result = await listContactMessages(getDb(), session.user, { filter, page });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <AdminPageHeader
        title="Messages"
        description="Messages sent through the contact form. Open one to read it in full and reply by email."
      />
      <nav aria-label="Filter messages" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={hrefFor(item.value, 1)}
            aria-current={filter === item.value ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filter === item.value
                ? "border-oak bg-oak-pale font-medium text-oak-deep"
                : "border-line-strong bg-surface text-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted">
        {result.total} {result.total === 1 ? "message" : "messages"}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
          {filter === "all" ? "No messages yet." : "No messages match this filter."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {result.items.map((message) => {
            const unread = !message.readAt;
            return (
              <li key={message.id}>
                <Link
                  href={`/admin/messages/${message.id}`}
                  className="grid gap-1 p-4 transition-colors hover:bg-canvas sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      {unread ? (
                        <span className="size-2 shrink-0 rounded-full bg-oak" aria-hidden="true" />
                      ) : null}
                      <span className={cn("text-ink", unread ? "font-semibold" : "font-medium")}>
                        {message.name}
                      </span>
                      <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">
                        {CONTACT_TOPIC_LABELS[message.topic]}
                      </span>
                      {unread ? <span className="sr-only">(unread)</span> : null}
                      {message.lastRepliedAt ? (
                        <span className="rounded-full bg-oak-pale px-2 py-0.5 text-xs text-oak-deep">
                          Replied
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm break-words text-muted">{message.preview}</p>
                  </div>
                  <time dateTime={message.createdAt.toISOString()} className="text-xs text-muted sm:pt-0.5">
                    {formatDateTime(message.createdAt)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={result.page} totalPages={totalPages} hrefFor={(target) => hrefFor(filter, target)} />
    </>
  );
}
