import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { pageViewReport } from "@/server/analytics/page-views";

export const metadata: Metadata = { title: "Traffic" };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-canvas px-4 py-3.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums">{value.toLocaleString("en-IN")}</dd>
    </div>
  );
}

export default async function TrafficPage() {
  const session = await requireSession();
  if (!can(session.user, "analytics.view")) return <AccessDenied />;
  const report = await pageViewReport(getDb(), session.user);
  if (!report) return <AccessDenied />;

  return (
    <>
      <AdminPageHeader
        title="Traffic"
        description="How many times each public page has been opened. Admin pages are not counted. A count is a page open, not a stored visitor: no cookies, names or IP addresses are kept. Days use India time."
      />
      <AdminCard title="Page views">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Today" value={report.today} />
          <Stat label="Last 7 days" value={report.last7Days} />
          <Stat label="Last 30 days" value={report.last30Days} />
          <Stat label="All time" value={report.allTime} />
        </dl>
      </AdminCard>
      <section className="mt-8" aria-labelledby="traffic-pages-heading">
        <h2 id="traffic-pages-heading" className="font-sans text-base font-semibold tracking-normal">
          Pages
        </h2>
        {report.pages.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
            No page views yet. Counts appear here after someone opens the public site.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Page
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Last 30 days
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    All time
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Last opened
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.pages.map((page) => (
                  <tr key={page.path}>
                    <td className="px-4 py-3">
                      <Link href={page.path} className="text-oak-deep underline-offset-2 hover:underline">
                        {page.path}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {page.views30.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {page.viewsAll.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-muted">{page.lastDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
