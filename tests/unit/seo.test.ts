import { describe, expect, it } from "vitest";
import { analyticsMeasurementId } from "@/lib/analytics";
import { pageMetadata } from "@/lib/seo/metadata";
import { buildRobots, buildSitemap } from "@/lib/seo/sitemap";
import { articleJsonLd, breadcrumbJsonLd, serializeJsonLd } from "@/lib/seo/structured-data";

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

describe("sitemap", () => {
  const input = {
    guides: [
      { slug: "a", updatedAt: day(3) },
      { slug: "b", updatedAt: day(5) },
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
      "http://localhost:3000/guides/a",
      "http://localhost:3000/guides/b",
    ]);
    for (const url of urls) {
      expect(url).not.toMatch(/\/search|\/admin|\?/);
    }
  });

  it("uses the most recent guide update as the home page lastModified", () => {
    const home = buildSitemap({ ...input, indexingEnabled: true })[0];
    expect(home?.lastModified).toEqual(day(5));
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
