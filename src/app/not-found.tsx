import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/components/site/site-chrome";
import { ButtonLink } from "@/components/ui/button";
import { categories, categoryPath } from "@/content/categories";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <SiteChrome>
      <section className="container-page py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="eyebrow">Error 404</p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">This page has been tidied away</h1>
          <p className="mt-5 text-lg text-muted">
            The page you were looking for does not exist or is no longer available. Try searching, or start
            from one of our categories.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/search">Search guides</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Go to the home page
            </ButtonLink>
          </div>
          <h2 className="mt-14 font-sans text-sm font-semibold tracking-normal">Browse by room</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
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
        </div>
      </section>
    </SiteChrome>
  );
}
