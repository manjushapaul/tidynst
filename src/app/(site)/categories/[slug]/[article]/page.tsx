import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { GuideDocument } from "@/components/content/guide-document";
import { JsonLd } from "@/components/seo/json-ld";
import { SubcategoryListing } from "@/components/site/subcategory-listing";
import { pageHref, parsePage } from "@/components/site/pagination";
import { guidePath, isCategorySlug, subcategoryPath } from "@/content/categories";
import { guideShareImage, pageMetadata } from "@/lib/seo/metadata";
import { collectionPageJsonLd } from "@/lib/seo/structured-data";
import { publicCategory } from "@/server/homepage";
import { publicDb, loadPublishedGuide, loadPublicSite, redirectRenamedGuide } from "@/server/loaders";
import {
  articleTopics,
  countPublishedGuides,
  type GuideSummary,
  listPublishedGuides,
  listTopicGuides,
  relatedGuides,
} from "@/server/public-content";
import {
  getPublicGroup,
  getPublicSubcategory,
  guideSection,
  listTopicsForGroup,
  type PublicGroup,
  type PublicSubcategory,
} from "@/server/subcategories";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ slug: string; article: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

type Address =
  | { kind: "guide"; guide: NonNullable<Awaited<ReturnType<typeof loadPublishedGuide>>>; path: string }
  | { kind: "group"; group: PublicGroup }
  | { kind: "subcategory"; subcategory: PublicSubcategory };

/**
 * A published article wins when it shares an address with a subcategory.
 * Otherwise the second segment is one of the subcategories shown on the category page.
 */
async function loadAddress(params: Props["params"]): Promise<Address | null> {
  const { slug: category, article } = await params;
  const guide = await loadPublishedGuide(article);
  if (guide) {
    const path = guidePath(guide);
    if (path !== `/categories/${category}/${article}`) permanentRedirect(path);
    return { kind: "guide", guide, path };
  }
  if (isCategorySlug(category)) {
    const db = await publicDb();
    const group = await getPublicGroup(db, category, article);
    if (group) return { kind: "group", group };
    const subcategory = await getPublicSubcategory(db, category, article);
    if (subcategory) return { kind: "subcategory", subcategory };
  }
  await redirectRenamedGuide(article);
  return null;
}

type Listing = Exclude<Address, { kind: "guide" }>;

/** One page of a subcategory or topic listing, and how many articles it has in all. */
async function listingPage(
  db: Awaited<ReturnType<typeof publicDb>>,
  found: Listing,
  page: number,
): Promise<{ total: number; guides: GuideSummary[] }> {
  const offset = (page - 1) * PAGE_SIZE;
  if (found.kind === "subcategory") {
    const all = await listTopicGuides(db, found.subcategory);
    return { total: all.length, guides: all.slice(offset, offset + PAGE_SIZE) };
  }
  const filter = { subcategoryGroupId: found.group.id };
  const [total, guides] = await Promise.all([
    countPublishedGuides(db, filter),
    listPublishedGuides(db, { ...filter, limit: PAGE_SIZE, offset }),
  ]);
  return { total, guides };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const found = await loadAddress(params);
  if (!found) return { title: "Page not found", robots: { index: false, follow: true } };
  if (found.kind === "guide") {
    const { guide, path } = found;
    const image = guide.image ?? guideShareImage(guide);
    return pageMetadata({
      title: guide.seoTitle ?? guide.title,
      description: guide.seoDescription ?? guide.excerpt,
      path,
      openGraph: {
        type: "article",
        publishedTime: guide.firstPublishedAt.toISOString(),
        modifiedTime: guide.updatedAt.toISOString(),
        images: [{ url: image.src, width: image.width, height: image.height, alt: image.alt }],
      },
    });
  }
  const home = await loadPublicSite();
  const subject = found.kind === "group" ? found.group : found.subcategory;
  const categoryName = publicCategory(home, subject.category)?.name ?? subject.category;
  const page = parsePage((await searchParams).page) ?? 1;
  const { total } = await listingPage(await publicDb(), found, page);
  const description = found.kind === "group" ? found.group.description : found.subcategory.groupDescription;
  const path = subcategoryPath(subject.category, subject.slug);
  return pageMetadata({
    title:
      page > 1 ? `${subject.name} — ${categoryName} — page ${page}` : `${subject.name} — ${categoryName}`,
    description,
    path: pageHref(path, page),
    noindex: total === 0,
  });
}

export default async function GuidePage({ params, searchParams }: Props) {
  const found = await loadAddress(params);
  if (!found) notFound();
  const home = await loadPublicSite();
  if (found.kind === "guide") {
    const db = await publicDb();
    const category = found.guide.category;
    const [related, areas, section] = await Promise.all([
      relatedGuides(db, found.guide),
      category ? articleTopics(db, category) : Promise.resolve([]),
      guideSection(db, found.guide),
    ]);
    return (
      <GuideDocument
        guide={found.guide}
        related={related}
        section={section}
        topics={
          category
            ? areas.map((area) => ({
                id: area.id,
                name: area.name,
                href: subcategoryPath(category, area.slug),
              }))
            : []
        }
        siteName={home.name}
        categoryNames={Object.fromEntries(home.categories.map((item) => [item.slug, item.name]))}
      />
    );
  }

  const page = parsePage((await searchParams).page);
  if (page === null) notFound();
  const db = await publicDb();
  const { total, guides } = await listingPage(db, found, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();
  const group =
    found.kind === "group"
      ? found.group
      : {
          id: found.subcategory.groupId,
          slug: found.subcategory.groupSlug,
          name: found.subcategory.groupName,
          description: found.subcategory.groupDescription,
        };
  const topics = await listTopicsForGroup(db, group.id, group.slug);
  const subject = found.kind === "group" ? found.group : found.subcategory;
  const categoryName = publicCategory(home, subject.category)?.name ?? subject.category;
  const fallback =
    found.kind === "subcategory" && total === 0
      ? {
          name: found.subcategory.groupName,
          path: subcategoryPath(found.subcategory.category, found.subcategory.groupSlug),
          guides: await listPublishedGuides(db, {
            subcategoryGroupId: found.subcategory.groupId,
            limit: PAGE_SIZE,
          }),
        }
      : undefined;
  return (
    <>
      {guides.length ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: `${subject.name} — ${categoryName}`,
            description:
              found.kind === "group" ? found.group.description : found.subcategory.groupDescription,
            path: pageHref(subcategoryPath(subject.category, subject.slug), page),
            items: guides.map((guide) => ({ name: guide.title, path: guidePath(guide) })),
            firstPosition: (page - 1) * PAGE_SIZE + 1,
          })}
        />
      ) : null}
      <SubcategoryListing
        categoryName={categoryName}
        category={subject.category}
        group={group}
        topics={topics}
        activeTopic={found.kind === "subcategory" ? found.subcategory : undefined}
        guides={guides}
        page={page}
        totalPages={totalPages}
        fallback={fallback}
      />
    </>
  );
}
