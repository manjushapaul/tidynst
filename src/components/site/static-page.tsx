import { PageHeader } from "./page-header";

type StaticPageProps = {
  title: string;
  lead: string;
  path: string;
  lastUpdated?: string;
  children: React.ReactNode;
};

/** Layout for policy and company pages: header, breadcrumb and a readable prose column. */
export function StaticPage({ title, lead, path, lastUpdated, children }: StaticPageProps) {
  return (
    <article>
      <PageHeader
        title={title}
        lead={lead}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: title, href: path },
        ]}
      />
      <div className="container-page py-12 sm:py-16">
        <div className="container-prose prose-tn">
          {children}
          {lastUpdated ? (
            <p className="!mt-12 border-t border-line pt-6 text-sm text-muted">Last updated: {lastUpdated}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
