import { describe, expect, it } from "vitest";
import { companyNav, legalNav, primaryNav } from "@/components/site/navigation";
import {
  DRAFT_PREVIEW_CACHE_CONTROL,
  DRAFT_PREVIEW_ROBOTS,
  draftPreviewHeaders,
} from "@/lib/http/preview-headers";
import { STATIC_SITEMAP_PATHS } from "@/lib/seo/sitemap";
import { safeHref } from "@/components/content/markdown-content";
import { uploadLengthProblem, MEDIA_MAX_REQUEST_BYTES } from "@/lib/media/inspect-image";

describe("draft preview exposure", () => {
  it("sends private no-store and noarchive headers", () => {
    expect(draftPreviewHeaders).toEqual([
      { key: "Cache-Control", value: DRAFT_PREVIEW_CACHE_CONTROL },
      { key: "X-Robots-Tag", value: DRAFT_PREVIEW_ROBOTS },
    ]);
    expect(DRAFT_PREVIEW_CACHE_CONTROL).toContain("private");
    expect(DRAFT_PREVIEW_CACHE_CONTROL).toContain("no-store");
    expect(DRAFT_PREVIEW_ROBOTS).toContain("noindex");
    expect(DRAFT_PREVIEW_ROBOTS).toContain("noarchive");
  });

  it("is absent from public navigation and the sitemap path list", () => {
    const hrefs = [...primaryNav, ...companyNav, ...legalNav].map((item) => item.href);
    expect(hrefs.some((href) => href.includes("/admin") || href.includes("preview"))).toBe(false);
    expect(STATIC_SITEMAP_PATHS.some((path) => path.includes("admin") || path.includes("preview"))).toBe(
      false,
    );
  });

  it("does not treat unsafe links as links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("http://example.com")).toBeNull();
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("/guides/example")).toBe("/guides/example");
  });
});

describe("upload length guard", () => {
  it("rejects a missing, invalid, or oversized declared length", () => {
    expect(uploadLengthProblem(null)).toBe("missing");
    expect(uploadLengthProblem("")).toBe("missing");
    expect(uploadLengthProblem("nope")).toBe("invalid");
    expect(uploadLengthProblem(String(MEDIA_MAX_REQUEST_BYTES + 1))).toBe("too_large");
    expect(uploadLengthProblem(String(MEDIA_MAX_REQUEST_BYTES))).toBeNull();
  });
});
