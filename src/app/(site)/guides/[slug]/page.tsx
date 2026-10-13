import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownContent } from "@/components/content/markdown-content";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { GuideGrid } from "@/components/site/guide-card";
import { GuideProducts } from "@/components/site/guide-products";
import { TableOfContents } from "@/components/site/table-of-contents";
import { categoryPath, getCategory } from "@/content/categories";
import { extractHeadings } from "@/lib/content/markdown";
import { formatDate } from "@/lib/format";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { articleJsonLd } from "@/lib/seo/structured-data";
import { site } from "@/lib/site";
import { publicDb, loadPublishedGuide } from "@/server/loaders";
import { relatedGuides } from "@/server/public-content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = await loadPublishedGuide(slug);
  if (!guide) return { title: "Page not found", robots: { index: false, follow: true } };
  return pageMetadata({
    title: guide.seoTitle ?? guide.title,
    description: guide.seoDescription ?? guide.excerpt,
    path: `/guides/${guide.slug}`,
    openGraph: {
      type: "article",
      publishedTime: guide.firstPublishedAt.toISOString(),
      modifiedTime: guide.updatedAt.toISOString(),
      ...(guide.image
        ? {
            images: [
              {
                url: guide.image.src,
                width: guide.image.width,
                height: guide.image.height,
                alt: guide.image.alt,
              },
            ],
          }
        : {}),
    },
  });
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = await loadPublishedGuide(slug);
  if (!guide) notFound();

  const category = guide.category ? getCategory(guide.category) : undefined;
  const headings = extractHeadings(guide.body);
  const related = await relatedGuides(await publicDb(), guide);
  const crumbs = [
    { name: "Home", href: "/" },
    ...(category
      ? [{ name: category.name, href: categoryPath(category.slug) }]
      : [{ name: "Guides", href: "/guides" }]),
    { name: guide.title, href: `/guides/${guide.slug}` },
  ];
  const wasUpdated = guide.updatedAt.getTime() - guide.firstPublishedAt.getTime() > 24 * 60 * 60 * 1000;

  return (
    <article>
      <JsonLd
        data={articleJsonLd({
          title: guide.title,
          description: guide.seoDescription ?? guide.excerpt,
          path: `/guides/${guide.slug}`,
          datePublished: guide.firstPublishedAt,
          dateModified: guide.updatedAt,
          image: guide.image,
          section: category?.name,
        })}
      />
      <header className="border-b border-line bg-gradient-to-b from-sand/70 to-canvas">
        <div className="container-page pt-8 pb-10 sm:pb-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-8 max-w-3xl">
            {category ? (
              <Link href={categoryPath(category.slug)} className="eyebrow hover:text-sage-deep">
                {category.name}
              </Link>
            ) : null}
            <h1 className="mt-3 text-4xl leading-[1.08] sm:text-5xl">{guide.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">{guide.excerpt}</p>
            <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              <span>By {site.editorialName}</span>
              <span aria-hidden="true">·</span>
              <span>
                {wasUpdated ? "Updated " : "Published "}
                <time dateTime={guide.updatedAt.toISOString()}>{formatDate(guide.updatedAt)}</time>
              </span>
              <span aria-hidden="true">·</span>
              <span>{guide.readingMinutes} min read</span>
            </p>
          </div>
        </div>
      </header>

      <div className="container-page py-10 sm:py-14">
        {guide.image ? (
          <figure className="mx-auto mb-12 max-w-4xl overflow-hidden rounded-(--radius-card) bg-sage-pale">
            <Image
              src={guide.image.src}
              alt={guide.image.alt}
              width={guide.image.width}
              height={guide.image.height}
              sizes="(min-width: 1024px) 896px, 100vw"
              className="h-auto w-full"
              priority
            />
          </figure>
        ) : null}

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
          <div className="min-w-0">
            <MarkdownContent markdown={guide.body} className="prose-tn max-w-[42rem]" />
            <GuideProducts products={guide.products} />
            {guide.topics.length ? (
              <div className="mt-12 border-t border-line pt-8">
                <h2 className="font-sans text-sm font-semibold tracking-normal">Topics</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {guide.topics.map((topic) => (
                    <li key={topic.id}>
                      <Link
                        href={`/topics/${topic.slug}`}
                        className="inline-block rounded-full bg-sage-pale px-3.5 py-1.5 text-sm text-sage-deep transition-colors hover:bg-sage hover:text-white"
                      >
                        {topic.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-10 text-sm text-muted">
              Found something out of date?{" "}
              <Link href="/contact" className="underline underline-offset-2">
                Tell us
              </Link>{" "}
              — read how we keep guides accurate in our{" "}
              <Link href="/editorial-policy" className="underline underline-offset-2">
                editorial policy
              </Link>
              .
            </p>
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TableOfContents headings={headings} />
            </div>
          </aside>
        </div>
      </div>

      {related.length ? (
        <section aria-labelledby="related-heading" className="border-t border-line bg-sand/50">
          <div className="container-page py-14">
            <h2 id="related-heading" className="text-3xl">
              Related guides
            </h2>
            <div className="mt-8">
              <GuideGrid guides={related} />
            </div>
          </div>
        </section>
      ) : null}
    </article>
  );
}
