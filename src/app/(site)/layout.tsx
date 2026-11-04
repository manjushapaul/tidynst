import type { Viewport } from "next";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { PageViewBeacon } from "@/components/analytics/page-view-beacon";
import { SiteChrome } from "@/components/site/site-chrome";

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteChrome>{children}</SiteChrome>
      <PageViewBeacon />
      <GoogleAnalytics />
    </>
  );
}
