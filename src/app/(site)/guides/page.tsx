import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { PageHeader } from "@/components/site/page-header";
import { Pagination, pageHref, parsePage } from "@/components/site/pagination";
import { categories, categoryPath } from "@/content/categories";
import { pageMetadata } from "@/lib/seo/metadata";
import { publicDb } from "@/server/loaders";
import { countPublishedGuides, listPublishedGuides } from "@/server/public-content";

const PAGE_SIZE = 12;

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page) ?? 1;
  const total = await countPublishedGuides(await publicDb());
  return pageMetadata({
    title: page > 1 ? `All guides — page ${page}` : "All guides",
    description:
      "Every TidyNest guide to organising small Indian homes: kitchens, bathrooms, wardrobes, compact apartments and rented flats.",
    path: pageHref("/guides", page),
    noindex: total === 0,
  });
}

export default async function GuidesPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  if (page === null) notFound();
  const db = await publicDb();
  const total = await countPublishedGuides(db);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();
  const guides = await listPublishedGuides(db, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <>
      <PageHeader
        eyebrow="Guides"
        title="All guides"
        lead="Practical, room-by-room guides for organising small Indian homes and rented apartments."
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
        ]}
      >
        <ul className="mt-8 flex flex-wrap gap-2" aria-label="Browse by category">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={categoryPath(category.slug)}
                className="inline-block rounded-full border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-sage hover:text-sage-deep"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </PageHeader>
      <section className="container-page py-12 sm:py-16" aria-label="Guides">
        {guides.length ? (
          <>
            <GuideGrid guides={guides} headingLevel="h2" priorityFirst={page === 1} />
            <Pagination basePath="/guides" page={page} totalPages={totalPages} />
          </>
        ) : (
          <EmptyState title="Our first guides are on their way">
            We are writing and reviewing our first guides. In the meantime, read about{" "}
            <Link href="/editorial-policy" className="underline underline-offset-2">
              how we work
            </Link>
            .
          </EmptyState>
        )}
      </section>
    </>
  );
}
