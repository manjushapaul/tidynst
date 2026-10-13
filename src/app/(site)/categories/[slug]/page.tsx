import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/site/category-icon";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { PageHeader } from "@/components/site/page-header";
import { Pagination, pageHref, parsePage } from "@/components/site/pagination";
import { categories, categoryPath, getCategory } from "@/content/categories";
import { pageMetadata } from "@/lib/seo/metadata";
import { publicDb } from "@/server/loaders";
import { countPublishedGuides, listPublishedGuides } from "@/server/public-content";

const PAGE_SIZE = 12;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return { title: "Page not found", robots: { index: false, follow: true } };
  const page = parsePage((await searchParams).page) ?? 1;
  const total = await countPublishedGuides(await publicDb(), { category: category.slug });
  return pageMetadata({
    title:
      page > 1 ? `${category.name} organising guides — page ${page}` : `${category.name} organising guides`,
    description: category.description,
    path: pageHref(categoryPath(category.slug), page),
    // A category hub with no published guides yet is thin content; keep it out of the index.
    noindex: total === 0,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  const page = parsePage((await searchParams).page);
  if (page === null) notFound();

  const db = await publicDb();
  const total = await countPublishedGuides(db, { category: category.slug });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();
  const guides = await listPublishedGuides(db, {
    category: category.slug,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const path = categoryPath(category.slug);

  return (
    <>
      <PageHeader
        eyebrow="Category"
        title={category.name}
        lead={category.intro}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: category.name, href: path },
        ]}
      >
        <ul className="mt-8 flex flex-wrap gap-2" aria-label={`What ${category.name} guides cover`}>
          {category.covers.map((item) => (
            <li key={item} className="rounded-full bg-sage-pale px-3.5 py-1.5 text-sm text-sage-deep">
              {item}
            </li>
          ))}
        </ul>
      </PageHeader>

      <section className="container-page py-12 sm:py-16" aria-labelledby="category-guides-heading">
        <h2 id="category-guides-heading" className="sr-only">
          {category.name} guides
        </h2>
        {guides.length ? (
          <>
            <GuideGrid guides={guides} priorityFirst={page === 1} />
            <Pagination basePath={path} page={page} totalPages={totalPages} />
          </>
        ) : (
          <EmptyState title={`${category.name} guides are in progress`}>
            We have not published any {category.name.toLowerCase()} guides yet. Browse{" "}
            <Link href="/guides" className="underline underline-offset-2">
              all guides
            </Link>{" "}
            in the meantime.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="other-categories-heading" className="border-t border-line bg-surface">
        <div className="container-page py-12">
          <h2 id="other-categories-heading" className="text-2xl">
            Other rooms
          </h2>
          <ul className="mt-6 flex flex-wrap gap-3">
            {categories
              .filter((other) => other.slug !== category.slug)
              .map((other) => (
                <li key={other.slug}>
                  <Link
                    href={categoryPath(other.slug)}
                    className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-sage hover:text-sage-deep"
                  >
                    <CategoryIcon slug={other.slug} className="size-4 text-sage" />
                    {other.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </section>
    </>
  );
}
