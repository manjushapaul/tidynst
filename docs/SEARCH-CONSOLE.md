# Google Search Console and launch indexing

TidyNest ships with search-engine indexing **disabled**. Until the owner approves launch:

- every page carries `<meta name="robots" content="noindex, follow">`,
- `robots.txt` returns `Disallow: /`,
- `sitemap.xml` is empty.

Nothing in this document should be done without the owner's approval.

## 1. Before enabling indexing

1. The production deployment is live on its final domain over HTTPS.
2. `NEXT_PUBLIC_SITE_URL` is set to that origin (for example `https://www.example.in`) in the
   Vercel **Production** environment. Canonical URLs, the sitemap and structured data all use it.
   With `SITE_INDEXING=enabled`, the build and server refuse to start unless it is an `https`
   address other than localhost.
3. At least a handful of guides have been reviewed and published through the CMS. The admin
   **SEO health** page lists remaining problems and categories that still need guides.
4. The privacy policy, affiliate disclosure and contact email are accurate.

## 2. Verify the property

Domain verification (recommended):

1. In Search Console choose **Add property → Domain** and enter the bare domain.
2. Add the TXT record Google shows at your DNS provider, then click **Verify**.

URL-prefix verification with an HTML tag (alternative):

1. Choose **URL prefix**, enter the full origin, and pick **HTML tag**.
2. Copy only the `content` value of the tag into `GOOGLE_SITE_VERIFICATION` in the Vercel
   Production environment and redeploy. The app renders the tag in every page's `<head>`.

## 3. Enable indexing

1. Set `SITE_INDEXING=enabled` in the Vercel **Production** environment only (never Preview).
2. Redeploy, then check:
   - `https://<domain>/robots.txt` allows `/`, disallows `/admin` and `/search`, and lists the sitemap.
   - `https://<domain>/sitemap.xml` lists the home page, policies, published guides, and only the
     categories and topics that have published guides.
   - A guide's HTML contains `<meta name="robots" content="index, follow, …">` and a canonical link.

## 4. Submit the sitemap

In Search Console open **Sitemaps**, submit `sitemap.xml`, and use **URL Inspection** on the home
page and one guide to request indexing.

## 5. What to monitor

- **Pages** report: drafts and admin URLs must never appear as indexed.
- **Core Web Vitals** report (needs real traffic before data appears).
- **Enhancements → Breadcrumbs** for structured-data errors.

Search Console does not guarantee indexing or rankings, and this project makes no such claims.
