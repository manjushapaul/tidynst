import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon, CategoryIllustration, hasCategoryIllustration } from "@/components/site/category-icon";
import { CmsIcon } from "@/components/site/cms-icon";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { SubcategoryGroups } from "@/components/site/subcategory-groups";
import { PageHeader } from "@/components/site/page-header";
import { Pagination, pageHref, parsePage } from "@/components/site/pagination";
import { JsonLd } from "@/components/seo/json-ld";
import { categoryPath, getCategory, guidePath } from "@/content/categories";
import { pageMetadata } from "@/lib/seo/metadata";
import { collectionPageJsonLd } from "@/lib/seo/structured-data";
import { loadPublicSite, publicDb } from "@/server/loaders";
import { publicCategory, type PublicCategory } from "@/server/homepage";
import { countPublishedGuides, listPublishedGuides } from "@/server/public-content";
import { listPublicGroups } from "@/server/subcategories";

const PAGE_SIZE = 12;
const ROOM_TINTS = [
  "bg-oak-pale hover:bg-[#ead8bc]",
  "bg-sand hover:bg-[#e8e0d1]",
  "bg-[#edf1e8] hover:bg-[#dfe8d9]",
  "bg-[#eef1f5] hover:bg-[#e0e6ee]",
  "bg-[#f6ebe5] hover:bg-[#eedbd1]",
] as const;

function RoomMark({ category }: { category: PublicCategory }) {
  const picture =
    "relative drop-shadow-[0_6px_8px_rgb(106_78_51/0.16)] transition-transform duration-500 ease-(--ease-gentle) group-hover:-translate-y-0.5";
  if (category.image) {
    return (
      <Image
        src={category.image.src}
        alt=""
        width={category.image.width}
        height={category.image.height}
        className={`${picture} max-h-11 w-auto object-contain`}
      />
    );
  }
  if (category.icon) {
    return <CmsIcon icon={category.icon} className="size-6 text-oak-deep" />;
  }
  if (hasCategoryIllustration(category.slug)) {
    return <CategoryIllustration slug={category.slug} size={44} className={picture} />;
  }
  return <CategoryIcon slug={category.slug} className="size-6 text-oak-deep" />;
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const base = getCategory((await params).slug);
  if (!base) return { title: "Page not found", robots: { index: false, follow: true } };
  const category = publicCategory(await loadPublicSite(), base.slug) ?? base;
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
  const base = getCategory((await params).slug);
  if (!base) notFound();
  const home = await loadPublicSite();
  const category = publicCategory(home, base.slug) ?? { ...base, image: null, imageMediaId: null, icon: null };
  const page = parsePage((await searchParams).page);
  if (page === null) notFound();

  const db = await publicDb();
  const [total, groups] = await Promise.all([
    countPublishedGuides(db, { category: category.slug }),
    listPublicGroups(db, category.slug),
  ]);
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
      {guides.length ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: `${category.name} organising guides`,
            description: category.description,
            path: pageHref(path, page),
            items: guides.map((guide) => ({ name: guide.title, path: guidePath(guide) })),
            firstPosition: (page - 1) * PAGE_SIZE + 1,
          })}
        />
      ) : null}
      <PageHeader
        eyebrow="Category"
        title={category.name}
        lead={category.intro}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: category.name, href: path },
        ]}
      >
        {groups.length ? (
          <SubcategoryGroups category={category.slug} groups={groups} />
        ) : (
          <ul className="mt-8 flex flex-wrap gap-2" aria-label={`What ${category.name} guides cover`}>
            {category.covers.map((item) => (
              <li key={item} className="rounded-full bg-oak-pale px-3.5 py-1.5 text-sm text-oak-deep">
                {item}
              </li>
            ))}
          </ul>
        )}
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
        <div className="container-page py-14 sm:py-16">
          <h2 id="other-categories-heading" className="text-3xl">
            Other rooms
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {home.categories
              .filter((other) => other.slug !== category.slug)
              .map((other, index) => (
                <li key={other.slug}>
                  <Link
                    href={categoryPath(other.slug)}
                    className={`group flex min-h-[76px] items-center gap-3 rounded-xl px-3 shadow-(--shadow-card) transition-[background-color,box-shadow,transform] duration-300 ease-(--ease-gentle) hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oak ${ROOM_TINTS[index % ROOM_TINTS.length]}`}
                  >
                    <span className="flex size-14 shrink-0 items-center justify-center">
                      <RoomMark category={other} />
                    </span>
                    <span className="min-w-0 text-[calc(0.95rem*var(--text-scale))] font-medium tracking-tight text-ink group-hover:text-oak-deep">
                      {other.name}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </section>
    </>
  );
}
