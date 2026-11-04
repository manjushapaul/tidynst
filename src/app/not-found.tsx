import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/not-found-content";
import { SiteChrome } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/** Unmatched URLs render under the root layout only, so this page brings its own site chrome. */
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
