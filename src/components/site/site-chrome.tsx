import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div data-site-chrome className="flex flex-1 flex-col bg-surface [--color-canvas:var(--color-surface)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
