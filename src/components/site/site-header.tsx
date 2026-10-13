import Link from "next/link";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { DesktopNav } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/90 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/80">
      <div className="relative container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-1">
          <DesktopNav />
          <Link
            href="/search"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-sage-pale"
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
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
