import Link from "next/link";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { PageHeader } from "@/components/site/page-header";
import { Pagination } from "@/components/site/pagination";
import { categoryPath, subcategoryPath, type CategorySlug } from "@/content/categories";
import type { GuideSummary } from "@/server/public-content";

type Topic = { id: string; slug: string; name: string };

export function SubcategoryListing({
  categoryName,
  category,
  group,
  topics = [],
  activeTopic,
  guides,
  page,
  totalPages,
  fallback,
}: {
  categoryName: string;
  category: CategorySlug;
  group: { slug: string; name: string; description: string };
  topics?: readonly Topic[];
  /** The topic being shown; the whole subcategory when absent. */
  activeTopic?: Pick<Topic, "slug" | "name">;
  guides: readonly GuideSummary[];
  page: number;
  totalPages: number;
  /** Shown on a topic page with no articles of its own: the rest of its subcategory. */
  fallback?: { name: string; path: string; guides: readonly GuideSummary[] };
}) {
  const groupPath = subcategoryPath(category, group.slug);
  const name = activeTopic?.name ?? group.name;
  const path = activeTopic ? subcategoryPath(category, activeTopic.slug) : groupPath;
  const tabs = [
    { key: "all", name: "All", href: groupPath, active: !activeTopic },
    ...topics.map((topic) => ({
      key: topic.id,
      name: topic.name,
      href: subcategoryPath(category, topic.slug),
      active: topic.slug === activeTopic?.slug,
    })),
  ];
  return (
    <>
      <PageHeader
        eyebrow={categoryName}
        title={group.name}
        lead={group.description}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: categoryName, href: categoryPath(category) },
          { name: group.name, href: groupPath },
          ...(activeTopic ? [{ name: activeTopic.name, href: path }] : []),
        ]}
      >
        {topics.length ? (
          <nav
            className="mt-7 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:gap-5"
            aria-labelledby="subcategory-topics-heading"
          >
            <h2 id="subcategory-topics-heading" className="eyebrow shrink-0">
              Topics
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
              {tabs.map((tab) => (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    scroll={false}
                    aria-current={tab.active ? "page" : undefined}
                    className="topic-chip w-full justify-center text-center sm:w-auto"
                  >
                    {tab.key === "all" ? "All guides" : tab.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </PageHeader>
      <section className="container-page py-12 sm:py-16" aria-labelledby="subcategory-guides-heading">
        <h2 id="subcategory-guides-heading" className="sr-only">
          {name} guides
        </h2>
        {guides.length ? (
          <>
            <GuideGrid guides={guides} priorityFirst={page === 1} />
            <Pagination basePath={path} page={page} totalPages={totalPages} />
          </>
        ) : fallback?.guides.length ? (
          <>
            <p className="mb-8 max-w-2xl text-muted">
              We have not published a guide just about {name.toLowerCase()} yet. These{" "}
              <Link href={fallback.path} className="text-oak-deep underline underline-offset-2">
                {fallback.name}
              </Link>{" "}
              guides cover related ground.
            </p>
            <GuideGrid guides={fallback.guides} priorityFirst />
          </>
        ) : (
          <EmptyState title={`No ${name} guides yet`}>
            Articles filed under {name} will appear here. Browse{" "}
            <Link href={categoryPath(category)} className="underline underline-offset-2">
              all {categoryName} guides
            </Link>{" "}
            in the meantime.
          </EmptyState>
        )}
      </section>
    </>
  );
}
