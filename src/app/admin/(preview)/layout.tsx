import { SiteChrome } from "@/components/site/site-chrome";
import { requireSession } from "@/server/auth/request";

/**
 * Public chrome for draft preview only. Analytics are intentionally omitted: preview URLs must
 * not be tracked, indexed, or added to public navigation.
 */
export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <SiteChrome>{children}</SiteChrome>;
}
