import Link from "next/link";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { DesktopNav } from "./nav-links";
import { companyNav } from "./navigation";
import { categoryPath } from "@/content/categories";
import { loadPublicSite } from "@/server/loaders";

export async function SiteHeader() {
  const home = await loadPublicSite();
  const primary = home.categories.map((category) => ({
    href: categoryPath(category.slug),
    label: category.navLabel,
  }));
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/90 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/80">
      <div className="relative container-page flex h-16 items-center justify-between gap-4">
        <Logo name={home.name} image={home.logo} />
        <div className="flex items-center gap-1">
          <DesktopNav items={primary} />
          <Link
            href="/search"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-oak-pale"
          >
            <span className="sr-only">Search guides</span>
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" strokeLinecap="round" />
            </svg>
          </Link>
          <MobileNav items={[...primary, { href: "/search", label: "Search" }, ...companyNav]} />
        </div>
      </div>
    </header>
  );
}
