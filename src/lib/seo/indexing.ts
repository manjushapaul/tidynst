/**
 * Search-engine indexing is off until the owner explicitly enables it with SITE_INDEXING=enabled
 * in the production environment. While off, every page is noindex and robots.txt disallows crawling.
 */
export function isIndexingEnabled(): boolean {
  return process.env.SITE_INDEXING === "enabled";
}

/**
 * Why this configuration must not go live, or null. With indexing on, canonical links, the sitemap,
 * the feed and share images all use NEXT_PUBLIC_SITE_URL, so a missing or local address would
 * point search engines at a site they cannot reach.
 */
export function launchConfigProblem(env: Readonly<Record<string, string | undefined>>): string | null {
  if (env.SITE_INDEXING !== "enabled") return null;
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return "SITE_INDEXING=enabled needs NEXT_PUBLIC_SITE_URL set to the live https address of the site.";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `NEXT_PUBLIC_SITE_URL is not a valid address: ${raw}`;
  }
  const local = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname);
  if (url.protocol !== "https:" || local) {
    return `SITE_INDEXING=enabled needs NEXT_PUBLIC_SITE_URL to be the live https address, not ${url.origin}.`;
  }
  return null;
}
