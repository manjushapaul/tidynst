/**
 * Monetisation is disabled until the owner explicitly approves it and sets
 * AFFILIATE_LINKS_ENABLED=true. While disabled, product links are plain, unpaid links, and
 * product URLs carrying affiliate tracking parameters are rejected by the CMS.
 */
export function affiliateLinksEnabled(): boolean {
  return process.env.AFFILIATE_LINKS_ENABLED === "true";
}

export function productLinkRel(): string {
  return affiliateLinksEnabled() ? "sponsored nofollow noopener noreferrer" : "nofollow noopener noreferrer";
}

/** Query parameters used by common affiliate programmes. */
const AFFILIATE_PARAMS = [
  "tag",
  "affid",
  "affiliate",
  "aff_id",
  "ref",
  "linkcode",
  "ascsubtag",
  "camp",
  "creative",
];

export function hasAffiliateTracking(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (AFFILIATE_PARAMS.includes(key.toLowerCase())) return true;
  }
  return /\/ref=/.test(url.pathname);
}
