import { describe, expect, it } from "vitest";
import { absoluteUrl, site } from "@/lib/site";
import { cn } from "@/lib/cn";

describe("site config", () => {
  it("defaults to localhost without NEXT_PUBLIC_SITE_URL", () => {
    expect(site.url).toBe("http://localhost:3000");
    expect(site.language).toBe("en-IN");
  });

  it("builds absolute URLs from paths", () => {
    expect(absoluteUrl("/guides/a")).toBe("http://localhost:3000/guides/a");
  });
});

describe("cn", () => {
  it("joins truthy class names only", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});
