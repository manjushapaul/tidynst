import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { SiteChrome } from "@/components/site/site-chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteChrome>{children}</SiteChrome>
      <GoogleAnalytics />
    </>
  );
}
