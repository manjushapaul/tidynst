import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMetadata } from "@/lib/seo/metadata";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pageMetadata", () => {
  it("sets an absolute canonical URL without query strings", () => {
    const meta = pageMetadata({ title: "About", description: "d", path: "/about" });
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/about");
  });

  it("is noindex while site indexing has not been enabled", () => {
    vi.stubEnv("SITE_INDEXING", "");
    const meta = pageMetadata({ title: "About", description: "d", path: "/about" });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("is indexable once indexing is enabled", () => {
    vi.stubEnv("SITE_INDEXING", "enabled");
    const meta = pageMetadata({ title: "About", description: "d", path: "/about" });
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("keeps page-level noindex even when indexing is enabled", () => {
    vi.stubEnv("SITE_INDEXING", "enabled");
    const meta = pageMetadata({ title: "Search", description: "d", path: "/search", noindex: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
