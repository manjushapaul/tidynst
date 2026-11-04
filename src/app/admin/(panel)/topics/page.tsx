import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { listTopics } from "@/server/topics";
import { CreateTopicForm } from "./create-topic-form";

export const metadata: Metadata = { title: "Topics" };

export default async function TopicsPage() {
  const session = await requireSession();
  if (!can(session.user, "topic.manage")) return <AccessDenied />;
  const items = await listTopics(getDb());

  return (
    <>
      <AdminPageHeader
        title="Topics"
        description="Topics group articles across categories. A new topic can be chosen on any article, including ones you are already editing."
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <AdminCard title="Add a topic">
          <CreateTopicForm csrf={session.csrfToken} />
        </AdminCard>
        <section aria-labelledby="topic-list-heading">
          <h2 id="topic-list-heading" className="font-sans text-base font-semibold tracking-normal">
            {items.length} {items.length === 1 ? "topic" : "topics"}
          </h2>
          <ul className="mt-4 grid gap-3">
            {items.map((topic) => (
              <li key={topic.id} className="rounded-xl border border-line bg-surface p-4">
                <h3 className="font-sans text-base font-semibold tracking-normal">{topic.name}</h3>
                <p className="mt-1 text-xs text-muted">/topics/{topic.slug}</p>
                <p className="mt-2 text-sm">{topic.description}</p>
                <p className="mt-2 text-xs">
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="text-oak-deep underline-offset-2 hover:underline"
                  >
                    View topic page
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
