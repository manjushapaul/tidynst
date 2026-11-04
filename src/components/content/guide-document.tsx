import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { MarkdownContent } from "@/components/content/markdown-content";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { GuideGrid } from "@/components/site/guide-card";
import { FAQ_HEADING, FAQ_HEADING_ID, GuideFaqs } from "@/components/site/guide-faqs";
import { GuideProducts } from "@/components/site/guide-products";
import { hasTableOfContents, TableOfContents } from "@/components/site/table-of-contents";
import { categoryPath, getCategory, guidePath } from "@/content/categories";
import { cn } from "@/lib/cn";
import { type ArticleImageStyle, articleImageCssVars } from "@/lib/content/article-image-style";
import type { BodyImageSizes } from "@/lib/content/body-images";
import { type FeaturedImageStyle, featuredImageInlineStyle } from "@/lib/content/featured-image-style";
import { extractHeadings } from "@/lib/content/markdown";
import { formatDate } from "@/lib/format";
import { guideShareImage } from "@/lib/seo/metadata";
import { articleJsonLd } from "@/lib/seo/structured-data";
import { site } from "@/lib/site";
import type { GuideSummary, PublicImage, PublicProduct, PublicTopic } from "@/server/public-content";
import type { CategorySlug } from "@/content/categories";
import type { GuideFaq } from "@/db/schema";

export type GuideDocumentModel = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  closing: string;
  category: CategorySlug | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readingMinutes: number;
  updatedAt: Date;
  firstPublishedAt: Date | null;
  image: PublicImage | null;
  topics: PublicTopic[];
  products: PublicProduct[];
  faqs: GuideFaq[];
  articleImageStyle: ArticleImageStyle;
  featuredImageStyle: FeaturedImageStyle;
  bodyImageSizes?: BodyImageSizes;
};

export function GuideDocument({
  guide,
  related = [],
  topics = [],
  section = [],
  structuredData = true,
  banner,
  optimizeImages = true,
  categoryNames,
  siteName = site.name,
}: {
  guide: GuideDocumentModel;
  related?: GuideSummary[];
  /** Subcategory buttons for this article. Filled from published guides, like related guides. */
  topics?: readonly { id: string; name: string; href: string }[];
  /** The subcategory and topic the article is filed under, shown between the category and the title. */
  section?: readonly { name: string; href: string }[];
  structuredData?: boolean;
  banner?: ReactNode;
  /** The image optimizer fetches without the visitor's session, so it can only serve published media. */
  optimizeImages?: boolean;
  categoryNames?: Partial<Record<CategorySlug, string>>;
  siteName?: string;
}) {
  const stored = guide.category ? getCategory(guide.category) : undefined;
  const category = stored ? { ...stored, name: categoryNames?.[stored.slug] ?? stored.name } : undefined;
  const headings = [
    ...extractHeadings(guide.body),
    ...extractHeadings(guide.closing),
    ...(guide.faqs.length ? [{ depth: 2, text: FAQ_HEADING, id: FAQ_HEADING_ID }] : []),
  ];
  const showToc = hasTableOfContents(headings);
  const crumbs = [
    { name: "Home", href: "/" },
    ...(category
      ? [{ name: category.name, href: categoryPath(category.slug) }, ...section]
      : [{ name: "Guides", href: "/guides" }]),
    { name: guide.title, href: guidePath(guide) },
  ];
  const wasUpdated =
    guide.firstPublishedAt !== null &&
    guide.updatedAt.getTime() - guide.firstPublishedAt.getTime() > 24 * 60 * 60 * 1000;

  return (
    <>
      {banner}
      <article>
        {structuredData && guide.firstPublishedAt ? (
          <JsonLd
            data={articleJsonLd({
              title: guide.title,
              description: guide.seoDescription ?? guide.excerpt,
              path: guidePath(guide),
              datePublished: guide.firstPublishedAt,
              dateModified: guide.updatedAt,
              image: guide.image ?? guideShareImage(guide),
              section: category?.name,
              publisherName: siteName,
            })}
          />
        ) : null}
        <header className="border-b border-line">
          <div className="container-page pt-8 pb-10 sm:pb-14">
            <Breadcrumbs items={crumbs} structuredData={structuredData} />
            <div className="mt-8 max-w-3xl">
              {category ? (
                <Link href={categoryPath(category.slug)} className="eyebrow hover:text-oak-deep">
                  {category.name}
                </Link>
              ) : null}
              <h1 className="mt-3 text-4xl leading-[1.08] sm:text-5xl">{guide.title}</h1>
              <p className="mt-5 text-lg leading-relaxed text-muted">{guide.excerpt}</p>
              <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                <span>By {site.editorialName}</span>
                <span aria-hidden="true">·</span>
                {guide.firstPublishedAt ? (
                  <span>
                    {wasUpdated ? "Updated " : "Published "}
                    <time dateTime={guide.updatedAt.toISOString()}>{formatDate(guide.updatedAt)}</time>
                  </span>
                ) : (
                  <span>
                    Last saved{" "}
                    <time dateTime={guide.updatedAt.toISOString()}>{formatDate(guide.updatedAt)}</time>
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span>{guide.readingMinutes} min read</span>
              </p>
            </div>
          </div>
        </header>

        <div className="container-page py-10 sm:py-14">
          {guide.image ? (
            <figure className="relative mx-auto mb-12 aspect-[21/9] max-w-full overflow-hidden rounded-(--radius-card) bg-oak-pale">
              <Image
                src={guide.image.src}
                alt={guide.image.alt}
                fill
                sizes="(min-width: 1152px) 1088px, 100vw"
                style={featuredImageInlineStyle(guide.featuredImageStyle)}
                priority
                unoptimized={!optimizeImages}
              />
            </figure>
          ) : null}

          <div
            className={
              showToc
                ? "article-grid-bleed grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16"
                : "grid gap-12"
            }
          >
            <div className="min-w-0">
              <MarkdownContent
                markdown={guide.body}
                className="prose-article prose-tn"
                style={articleImageCssVars(guide.articleImageStyle)}
                layout="article"
                imageSizes={guide.bodyImageSizes}
              />
              {guide.closing.trim() ? (
                <MarkdownContent
                  markdown={guide.closing}
                  className="prose-tn mt-12 border-t border-line pt-10"
                  imageSizes={guide.bodyImageSizes}
                />
              ) : null}
              <GuideProducts products={guide.products} siteName={siteName} />
              <GuideFaqs faqs={guide.faqs} />
              <div className="mt-14 overflow-hidden rounded-2xl border border-line bg-surface">
                {topics.length ? (
                  <nav aria-labelledby="guide-topics-heading" className="px-5 py-5 sm:px-6">
                    <h2
                      id="guide-topics-heading"
                      className="font-sans text-xs font-semibold tracking-[0.14em] text-muted uppercase"
                    >
                      Related topics
                    </h2>
                    <ul className="mt-4 flex flex-wrap gap-2.5">
                      {topics.map((topic) => (
                        <li key={topic.id}>
                          <Link href={topic.href} className="topic-chip">
                            {topic.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}
                <div
                  className={cn(
                    "flex flex-col gap-3 bg-canvas px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6",
                    topics.length > 0 && "border-t border-line",
                  )}
                >
                  <p className="text-sm leading-relaxed text-muted">
                    <span className="font-medium text-ink">Spotted something out of date?</span> We correct
                    mistakes promptly, as set out in our{" "}
                    <Link
                      href="/editorial-policy"
                      className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-oak-deep hover:decoration-oak"
                    >
                      editorial policy
                    </Link>
                    .
                  </p>
                  <Link
                    href="/contact"
                    className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-oak-deep"
                  >
                    Suggest an update
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </Link>
                </div>
              </div>
            </div>
            {showToc ? (
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <TableOfContents headings={headings} />
                </div>
              </aside>
            ) : null}
          </div>
        </div>

        {related.length ? (
          <section aria-labelledby="related-heading" className="border-t border-line">
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
    </>
  );
}
