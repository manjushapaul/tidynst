import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { PageHeader } from "@/components/site/page-header";
import { Pagination, pageHref, parsePage } from "@/components/site/pagination";
import { JsonLd } from "@/components/seo/json-ld";
import { guidePath } from "@/content/categories";
import { pageMetadata } from "@/lib/seo/metadata";
import { collectionPageJsonLd } from "@/lib/seo/structured-data";
import { loadTopic, publicDb } from "@/server/loaders";
import { countPublishedGuides, listPublishedGuides } from "@/server/public-content";

const PAGE_SIZE = 12;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const topic = await loadTopic((await params).slug);
  if (!topic) return { title: "Page not found", robots: { index: false, follow: true } };
  const page = parsePage((await searchParams).page) ?? 1;
  const total = await countPublishedGuides(await publicDb(), { topicId: topic.id });
  return pageMetadata({
    title: page > 1 ? `${topic.name} guides — page ${page}` : `${topic.name} organising guides`,
    description: topic.description,
    path: pageHref(`/topics/${topic.slug}`, page),
    noindex: total === 0,
  });
}

export default async function TopicPage({ params, searchParams }: Props) {
  const topic = await loadTopic((await params).slug);
  if (!topic) notFound();
  const page = parsePage((await searchParams).page);
  if (page === null) notFound();

  const db = await publicDb();
  const total = await countPublishedGuides(db, { topicId: topic.id });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();
  const guides = await listPublishedGuides(db, {
    topicId: topic.id,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const path = `/topics/${topic.slug}`;

  return (
    <>
      {guides.length ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: `${topic.name} organising guides`,
            description: topic.description,
            path: pageHref(path, page),
            items: guides.map((guide) => ({ name: guide.title, path: guidePath(guide) })),
            firstPosition: (page - 1) * PAGE_SIZE + 1,
          })}
        />
      ) : null}
      <PageHeader
        eyebrow="Topic"
        title={topic.name}
        lead={topic.description}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
          { name: topic.name, href: path },
        ]}
      />
      <section className="container-page py-12 sm:py-16" aria-labelledby="topic-guides-heading">
        <h2 id="topic-guides-heading" className="sr-only">
          {topic.name} guides
        </h2>
        {guides.length ? (
          <>
            <GuideGrid guides={guides} priorityFirst={page === 1} />
            <Pagination basePath={path} page={page} totalPages={totalPages} />
          </>
        ) : (
          <EmptyState title="No guides in this collection yet">
            Browse{" "}
            <Link href="/guides" className="underline underline-offset-2">
              all guides
            </Link>{" "}
            instead.
          </EmptyState>
        )}
      </section>
    </>
  );
}
