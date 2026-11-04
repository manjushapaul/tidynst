import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { getCategory } from "@/content/categories";
import { cn } from "@/lib/cn";
import { SEO_HEALTH_RULES } from "@/lib/content/seo-health";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { getPublicHomepage } from "@/server/homepage";
import { seoHealthReport } from "@/server/seo-health";

export const metadata: Metadata = { title: "SEO health" };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-canvas px-4 py-3.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums">{value.toLocaleString("en-IN")}</dd>
    </div>
  );
}

function coverageNote(published: number): { text: string; tone: "danger" | "warning" | "ok" } {
  if (published === 0) return { text: "Hidden from search until a guide is published", tone: "danger" };
  if (published < SEO_HEALTH_RULES.categoryTarget) {
    return { text: `Aim for at least ${SEO_HEALTH_RULES.categoryTarget} published guides`, tone: "warning" };
  }
  return { text: "Good coverage", tone: "ok" };
}

export default async function SeoHealthPage() {
  const session = await requireSession();
  if (!can(session.user, "guide.editAny")) return <AccessDenied />;
  const db = getDb();
  const [report, home] = await Promise.all([seoHealthReport(db), getPublicHomepage(db).catch(() => null)]);
  const categoryName = (slug: string) =>
    home?.categories.find((category) => category.slug === slug)?.name ?? getCategory(slug)?.name ?? slug;

  const fixes = (issues: { level: string }[]) => issues.filter((issue) => issue.level === "fix").length;
  const withIssues = report.guides
    .filter((guide) => guide.issues.length > 0)
    .sort((a, b) => fixes(b.issues) - fixes(a.issues) || Number(b.published) - Number(a.published));
  const clear = report.guides.filter((guide) => guide.issues.length === 0);

  return (
    <>
      <AdminPageHeader
        title="SEO health"
        description="Things that affect how articles are found and shown in search, checked on the latest saved version of every article. “Fix” items hurt search results; “Improve” items are worth doing when you can."
      />

      <AdminCard title="Summary">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Articles checked" value={report.guides.length} />
          <Stat label="Need fixes" value={report.guides.filter((guide) => fixes(guide.issues) > 0).length} />
          <Stat label="Could improve" value={withIssues.length} />
          <Stat label="All clear" value={clear.length} />
        </dl>
      </AdminCard>

      <AdminCard title="Category coverage" className="mt-6">
        <ul className="divide-y divide-line">
          {report.categories.map((category) => {
            const note = coverageNote(category.published);
            return (
              <li
                key={category.slug}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span className="font-medium">{categoryName(category.slug)}</span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-muted tabular-nums">
                    {category.published} published · {category.drafts} draft{category.drafts === 1 ? "" : "s"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      note.tone === "danger" && "bg-danger-pale text-danger",
                      note.tone === "warning" && "bg-warning-pale text-warning",
                      note.tone === "ok" && "bg-oak-pale text-oak-deep",
                    )}
                  >
                    {note.text}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </AdminCard>

      <section className="mt-8" aria-labelledby="seo-articles-heading">
        <h2 id="seo-articles-heading" className="font-sans text-base font-semibold tracking-normal">
          Articles to look at
        </h2>
        {withIssues.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-8 text-sm text-muted">
            {report.guides.length === 0 ? "No articles yet." : "Every article passes these checks."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {withIssues.map((guide) => (
              <li key={guide.id} className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/admin/guides/${guide.id}`}
                    className="font-medium text-oak-deep underline-offset-2 hover:underline"
                  >
                    {guide.title}
                  </Link>
                  <span className="text-xs text-muted">
                    {guide.published ? "Published" : "Draft"} · {guide.words.toLocaleString("en-IN")} words
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {guide.issues.map((issue) => (
                    <li key={issue.message} className="flex gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 h-fit shrink-0 rounded-full px-2 py-px text-[calc(0.7rem*var(--text-scale))] font-semibold",
                          issue.level === "fix" ? "bg-danger-pale text-danger" : "bg-sand text-muted",
                        )}
                      >
                        {issue.level === "fix" ? "Fix" : "Improve"}
                      </span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {clear.length ? (
          <p className="mt-4 text-sm text-muted">
            All clear: {clear.map((guide) => guide.title).join(", ")}.
          </p>
        ) : null}
      </section>
    </>
  );
}
