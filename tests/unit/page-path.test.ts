import { describe, expect, it } from "vitest";
import { analyticsDay, isAutomatedClient, normalisePagePath, shiftDay } from "@/lib/analytics/page-path";

describe("public page paths", () => {
  it("keeps ordinary public addresses", () => {
    expect(normalisePagePath("/")).toBe("/");
    expect(normalisePagePath("/categories/kitchen/small-kitchen-organization-ideas")).toBe(
      "/categories/kitchen/small-kitchen-organization-ideas",
    );
    expect(normalisePagePath("/Guides/")).toBe("/guides");
  });

  it("drops queries, admin routes and anything that is not a page address", () => {
    expect(normalisePagePath("/search?q=masala")).toBeNull();
    expect(normalisePagePath("/admin/traffic")).toBeNull();
    expect(normalisePagePath("/admin")).toBeNull();
    expect(normalisePagePath("/media/abc")).toBeNull();
    expect(normalisePagePath("/page-view")).toBeNull();
    expect(normalisePagePath("//evil.example")).toBeNull();
    expect(normalisePagePath("/../secret")).toBeNull();
    expect(normalisePagePath("https://example.com/")).toBeNull();
  });
});

describe("analytics day", () => {
  it("uses the India calendar and can step backwards", () => {
    expect(analyticsDay(new Date("2026-10-20T06:30:00.000Z"))).toBe("2026-10-20");
    expect(analyticsDay(new Date("2026-10-19T20:00:00.000Z"))).toBe("2026-10-20");
    expect(shiftDay("2026-10-20", -29)).toBe("2026-09-21");
  });
});

describe("automated clients", () => {
  it("skips crawlers and counts a normal browser", () => {
    expect(
      isAutomatedClient("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    ).toBe(true);
    expect(
      isAutomatedClient(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0",
      ),
    ).toBe(false);
    expect(isAutomatedClient(null)).toBe(false);
  });
});
