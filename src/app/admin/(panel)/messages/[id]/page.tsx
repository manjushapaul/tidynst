import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { CONTACT_TOPIC_LABELS } from "@/lib/content/contact-schema";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getContactMessage, markContactMessageRead } from "@/server/contact-messages";
import { getDb } from "@/server/db";
import { ReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Message" };

type Props = { params: Promise<{ id: string }> };

export default async function MessagePage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session.user, "message.manage")) return <AccessDenied />;
  const db = getDb();
  const message = await getContactMessage(db, session.user, id);
  if (!message) notFound();
  if (!message.readAt) await markContactMessageRead(db, session.user, message.id);

  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/messages" className="text-oak-deep underline-offset-2 hover:underline">
          ← All messages
        </Link>
      </p>
      <AdminPageHeader
        title={message.name}
        description={
          <>
            {CONTACT_TOPIC_LABELS[message.topic]} · received{" "}
            <time dateTime={message.createdAt.toISOString()}>{formatDateTime(message.createdAt)}</time>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <AdminCard title="Message">
            <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">From</dt>
                <dd>{message.name}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted">Email</dt>
                <dd className="break-all">
                  <a
                    href={`mailto:${message.email}`}
                    className="text-oak-deep underline-offset-2 hover:underline"
                  >
                    {message.email}
                  </a>
                </dd>
              </div>
            </dl>
            <div className="rounded-xl border border-line bg-canvas p-4 text-[calc(0.95rem*var(--text-scale))] leading-relaxed break-words whitespace-pre-line">
              {message.message}
            </div>
          </AdminCard>

          <AdminCard title={message.replies.length ? `Replies (${message.replies.length})` : "Replies"}>
            {message.replies.length === 0 ? (
              <p className="text-sm text-muted">No reply has been sent yet.</p>
            ) : (
              <ol className="space-y-4">
                {message.replies.map((reply) => (
                  <li key={reply.id} className="border-l-2 border-oak-pale pl-4">
                    <p className="text-xs text-muted">
                      <span className="font-medium text-ink">{reply.authorName ?? "A former user"}</span> ·{" "}
                      <time dateTime={reply.createdAt.toISOString()}>{formatDateTime(reply.createdAt)}</time>
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-line">
                      {reply.body}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </AdminCard>
        </div>

        <AdminCard title="Reply by email" className="self-start">
          <ReplyForm csrf={session.csrfToken} messageId={message.id} to={message.email} />
        </AdminCard>
      </div>
    </>
  );
}
