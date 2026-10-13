/**
 * Search-engine indexing is off until the owner explicitly enables it with SITE_INDEXING=enabled
 * in the production environment. While off, every page is noindex and robots.txt disallows crawling.
 */
export function isIndexingEnabled(): boolean {
  return process.env.SITE_INDEXING === "enabled";
}
