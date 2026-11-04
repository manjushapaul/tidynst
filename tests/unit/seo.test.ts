import { describe, expect, it } from "vitest";
import { analyticsMeasurementId } from "@/lib/analytics";
import { buildRssFeed } from "@/lib/seo/feed";
import { guideShareImage, pageMetadata } from "@/lib/seo/metadata";
import { buildRobots, buildSitemap } from "@/lib/seo/sitemap";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  serializeJsonLd,
} from "@/lib/seo/structured-data";

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

describe("sitemap", () => {
  const input = {
    guides: [
      { slug: "a", category: "kitchen" as const, updatedAt: day(3) },
      { slug: "b", category: "renters" as const, updatedAt: day(5) },
    ],
    categories: [{ slug: "kitchen" as const, updatedAt: day(5) }],
    topics: [{ slug: "no-drill", updatedAt: day(3) }],
  };

  it("is empty while site indexing is disabled", () => {
    expect(buildSitemap({ ...input, indexingEnabled: false })).toEqual([]);
  });

  it("lists only indexable canonical URLs when indexing is enabled", () => {
    const urls = buildSitemap({ ...input, indexingEnabled: true }).map((entry) => entry.url);
    expect(urls).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/guides",
      "http://localhost:3000/about",
      "http://localhost:3000/editorial-policy",
      "http://localhost:3000/contact",
      "http://localhost:3000/privacy",
      "http://localhost:3000/affiliate-disclosure",
      "http://localhost:3000/categories/kitchen",
      "http://localhost:3000/topics/no-drill",
      "http://localhost:3000/categories/kitchen/a",
      "http://localhost:3000/categories/renters/b",
    ]);
    for (const url of urls) {
      expect(url).not.toMatch(/\/search|\/admin|\?/);
    }
  });

  it("uses the most recent guide update as the home page lastModified", () => {
    const home = buildSitemap({ ...input, indexingEnabled: true })[0];
    expect(home?.lastModified).toEqual(day(5));
  });

  it("lists a guide's images as absolute URLs", () => {
    const entries = buildSitemap({
      indexingEnabled: true,
      guides: [
        {
          slug: "a",
          category: "kitchen",
          updatedAt: day(3),
          images: ["/media/x/shelf%20photo.jpg", "/media/y/jars.webp"],
        },
        { slug: "b", category: "kitchen", updatedAt: day(3), images: [] },
      ],
      categories: [],
      topics: [],
    });
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    expect(byUrl.get("http://localhost:3000/categories/kitchen/a")?.images).toEqual([
      "http://localhost:3000/media/x/shelf%20photo.jpg",
      "http://localhost:3000/media/y/jars.webp",
    ]);
    expect(byUrl.get("http://localhost:3000/categories/kitchen/b")).not.toHaveProperty("images");
  });

  it("omits the empty guides index when nothing is published", () => {
    const urls = buildSitemap({ indexingEnabled: true, guides: [], categories: [], topics: [] }).map(
      (e) => e.url,
    );
    expect(urls).not.toContain("http://localhost:3000/guides");
  });
});

describe("robots.txt", () => {
  it("blocks everything while indexing is disabled", () => {
    expect(buildRobots(false)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("allows public pages, blocks admin and search, and links the sitemap when enabled", () => {
    expect(buildRobots(true)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/search"] },
      sitemap: "http://localhost:3000/sitemap.xml",
    });
  });
});

describe("structured data", () => {
  it("escapes characters that could close the script element", () => {
    const out = serializeJsonLd({ headline: "</script><script>alert(1)</script> & more" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out)).toEqual({ headline: "</script><script>alert(1)</script> & more" });
  });

  it("builds breadcrumbs with absolute URLs and positions", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Home", href: "/" },
        { name: "Kitchen", href: "/categories/kitchen" },
      ]),
    ).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Home", item: "http://localhost:3000/" },
        { position: 2, name: "Kitchen", item: "http://localhost:3000/categories/kitchen" },
      ],
    });
  });

  it("attributes articles to the editorial organisation and emits no ratings", () => {
    const article = articleJsonLd({
      title: "T",
      description: "D",
      path: "/guides/t",
      datePublished: day(1),
      dateModified: day(2),
    });
    expect(article).toMatchObject({
      "@type": "Article",
      author: { "@type": "Organization", name: "TidyNest Editorial" },
      datePublished: day(1).toISOString(),
      dateModified: day(2).toISOString(),
    });
    expect(JSON.stringify(article)).not.toMatch(/aggregateRating|review/i);
  });

  it("describes a listing page and continues item numbering across pages", () => {
    const page = collectionPageJsonLd({
      name: "Kitchen organising guides",
      description: "D",
      path: "/categories/kitchen?page=2",
      items: [
        { name: "A", path: "/categories/kitchen/a" },
        { name: "B", path: "/categories/kitchen/b" },
      ],
      firstPosition: 13,
    });
    expect(page).toMatchObject({
      "@type": "CollectionPage",
      url: "http://localhost:3000/categories/kitchen?page=2",
      isPartOf: { "@id": "http://localhost:3000/#website" },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [
          { "@type": "ListItem", position: 13, name: "A", url: "http://localhost:3000/categories/kitchen/a" },
          { "@type": "ListItem", position: 14, name: "B", url: "http://localhost:3000/categories/kitchen/b" },
        ],
      },
    });
  });
});

describe("guide share image", () => {
  it("changes address when the guide is republished", () => {
    const first = guideShareImage({ slug: "spice-drawer", title: "T", updatedAt: day(1) });
    const second = guideShareImage({ slug: "spice-drawer", title: "T", updatedAt: day(2) });
    expect(first).toMatchObject({ width: 1200, height: 630, alt: "T" });
    expect(first.src).toMatch(/^\/og\/guide\/spice-drawer\?v=\d+$/);
    expect(second.src).not.toBe(first.src);
  });
});

describe("RSS feed", () => {
  it("escapes text and links each guide by its canonical URL", () => {
    const xml = buildRssFeed({
      title: "TidyNest",
      description: "Tips & tricks",
      items: [
        {
          title: "Pots <and> pans",
          description: "Stack them 'right'",
          path: "/categories/kitchen/pots",
          publishedAt: day(4),
          category: "Kitchen",
        },
      ],
    });
    expect(xml).toContain("<description>Tips &amp; tricks</description>");
    expect(xml).toContain("<title>Pots &lt;and&gt; pans</title>");
    expect(xml).toContain("<description>Stack them &apos;right&apos;</description>");
    expect(xml).toContain('<guid isPermaLink="true">http://localhost:3000/categories/kitchen/pots</guid>');
    expect(xml).toContain(`<pubDate>${day(4).toUTCString()}</pubDate>`);
    expect(xml).toContain("<category>Kitchen</category>");
    expect(xml).toContain('href="http://localhost:3000/feed.xml" rel="self"');
  });

  it("is a valid empty channel when nothing is published", () => {
    const xml = buildRssFeed({ title: "T", description: "D", items: [] });
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
    expect(xml).not.toContain("lastBuildDate");
  });
});

describe("page metadata", () => {
  it("falls back to the default share image", () => {
    const meta = pageMetadata({ title: "T", description: "D", path: "/" });
    expect(meta.openGraph?.images).toEqual([
      { url: "/og/default", width: 1200, height: 630, alt: "TidyNest" },
    ]);
  });
});

describe("analytics gating", () => {
  it("stays off unless explicitly enabled with a valid measurement id", () => {
    expect(analyticsMeasurementId({})).toBeNull();
    expect(analyticsMeasurementId({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC1234" })).toBeNull();
    expect(analyticsMeasurementId({ NEXT_PUBLIC_ANALYTICS_ENABLED: "true" })).toBeNull();
    expect(
      analyticsMeasurementId({
        NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
        NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-1",
      }),
    ).toBeNull();
    expect(
      analyticsMeasurementId({
        NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
        NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC1234",
      }),
    ).toBe("G-ABC1234");
  });
});
