import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { CategoryGrid } from "@/components/site/category-grid";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { PageHeader } from "@/components/site/page-header";
import { categoryPath } from "@/content/categories";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadPublicSite, publicDb } from "@/server/loaders";
import { normaliseSearchQuery, SEARCH_QUERY_MAX, searchPublishedGuides } from "@/server/public-content";

// Search result pages are never indexed and never listed in the sitemap.
export const metadata: Metadata = pageMetadata({
  title: "Search guides",
  description: "Search TidyNest's guides to organising small Indian homes and rented apartments.",
  path: "/search",
  noindex: true,
});

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function SearchPage({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const query = normaliseSearchQuery(Array.isArray(raw) ? raw[0] : raw);
  const results = query ? await searchPublishedGuides(await publicDb(), query) : [];
  const home = await loadPublicSite();
  const lowered = query?.toLowerCase() ?? "";
  const matchingCategories = query
    ? home.categories.filter(
        (category) => category.name.toLowerCase().includes(lowered) || lowered.includes(category.slug),
      )
    : [];

  return (
    <>
      <PageHeader
        title="Search guides"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Search", href: "/search" },
        ]}
      >
        <Form action="/search" role="search" className="mt-8 flex max-w-xl gap-2">
          <label htmlFor="search-q" className="sr-only">
            Search guides
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={query ?? ""}
            maxLength={SEARCH_QUERY_MAX}
            placeholder="Try “spice storage” or “no-drill shelves”"
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-5 py-3 text-base outline-none placeholder:text-muted/70 focus:border-oak focus:ring-2 focus:ring-oak/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-oak px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-oak-deep"
          >
            Search
          </button>
        </Form>
      </PageHeader>

      <section className="container-page py-12 sm:py-16" aria-live="polite">
        {query ? (
          <>
            <h2 className="text-2xl">
              {results.length
                ? `${results.length} ${results.length === 1 ? "guide" : "guides"} for “${query}”`
                : `No guides found for “${query}”`}
            </h2>
            {matchingCategories.length ? (
              <p className="mt-3 text-muted">
                Looking for a room?{" "}
                {matchingCategories.map((category, index) => (
                  <span key={category.slug}>
                    {index ? ", " : ""}
                    <Link
                      href={categoryPath(category.slug)}
                      className="text-oak-deep underline underline-offset-2"
                    >
                      {category.name}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
            <div className="mt-8">
              {results.length ? (
                <GuideGrid guides={results} />
              ) : (
                <EmptyState title="Try a different search">
                  Use simpler words, check the spelling, or browse by room below.
                </EmptyState>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted">Enter at least two characters to search our guides, or browse by room.</p>
        )}
        <div className="mt-14">
          <h2 className="text-2xl">Browse by room</h2>
          <div className="mt-6">
            <CategoryGrid categories={home.categories} />
          </div>
        </div>
      </section>
    </>
  );
}
