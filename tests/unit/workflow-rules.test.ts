import { describe, expect, it } from "vitest";
import { describeAuditAction, isAuditAction } from "@/lib/audit-actions";
import { canTransition, productUrlProblem, todayInIndia } from "@/lib/content/product-schema";
import { bodyMediaIds, publishIssues } from "@/lib/content/publish-rules";
import { guideContent, publishableBody } from "../support/fixtures";

const IMAGE = "11111111-2222-4333-8444-555555555555";

describe("bodyMediaIds", () => {
  it("finds library images and links in the body, ignoring other URLs", () => {
    const body = `![A](/media/${IMAGE}/a.png) [file](/media/${IMAGE.toUpperCase()}/b.png) ![x](https://cdn.example.com/media/${IMAGE}/c.png) [bad](/media/not-a-uuid/d.png)`;
    expect(bodyMediaIds(body)).toEqual([IMAGE]);
  });

  it("reports missing body images only when the context lists known media", () => {
    const content = guideContent({ body: `${publishableBody()}\n\n![Shelf](/media/${IMAGE}/shelf.png)` });
    const base = { productStatus: new Map(), knownTopicIds: new Set<string>(), featuredImageExists: false };
    expect(publishIssues(content, base).some((issue) => issue.message.includes("media library"))).toBe(false);
    expect(
      publishIssues(content, { ...base, knownMediaIds: new Set<string>() }).some((issue) =>
        issue.message.includes("media library"),
      ),
    ).toBe(true);
    expect(
      publishIssues(content, { ...base, knownMediaIds: new Set([IMAGE]) }).some((issue) =>
        issue.message.includes("media library"),
      ),
    ).toBe(false);
  });
});

describe("product rules", () => {
  it("accepts plain https links and rejects unsafe or tracked ones", () => {
    expect(productUrlProblem("https://shop.example.com/item?colour=blue")).toBeNull();
    expect(productUrlProblem("ftp://shop.example.com/item")).toMatch(/https/);
    expect(productUrlProblem("javascript:alert(1)")).toMatch(/https/);
    expect(productUrlProblem("https://localhost/item")).toMatch(/public/);
    expect(productUrlProblem("https://www.amazon.in/dp/B0TEST/ref=sr_1_1")).toMatch(/affiliate/i);
    expect(productUrlProblem("https://shop.example.com/item?AffID=9")).toMatch(/affiliate/i);
  });

  it("allows only the documented status transitions", () => {
    expect(canTransition("draft", "active")).toBe(true);
    expect(canTransition("active", "draft")).toBe(true);
    expect(canTransition("active", "retired")).toBe(true);
    expect(canTransition("retired", "draft")).toBe(true);
    expect(canTransition("retired", "active")).toBe(false);
  });

  it("computes today's date in India", () => {
    expect(todayInIndia(new Date("2026-03-20T20:00:00Z"))).toBe("2026-03-21");
  });
});

describe("audit action labels", () => {
  it("labels known actions and passes unknown ones through", () => {
    expect(isAuditAction("guide.published")).toBe(true);
    expect(describeAuditAction("guide.review_approved")).toBe("approved an article");
    expect(describeAuditAction("custom.thing")).toBe("custom.thing");
    expect(isAuditAction("toString")).toBe(false);
  });
});
