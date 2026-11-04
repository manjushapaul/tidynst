import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiffBlock } from "@/components/admin/diff-view";
import { diffGuideContent, diffLines, escapeHtml } from "@/lib/content/diff";
import { guideContent } from "../support/fixtures";

describe("diff", () => {
  it("marks added and removed lines", () => {
    expect(diffLines("a\nb", "a\nc")).toEqual([
      { type: "context", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "c" },
    ]);
  });

  it("escapes diff text when rendered", () => {
    const malicious = '<script>alert(1)</script><img src=x onerror="alert(1)">';
    expect(escapeHtml(malicious)).not.toContain("<script>");
    expect(escapeHtml(malicious)).toContain("&lt;script&gt;");
    const html = renderToStaticMarkup(
      createElement(DiffBlock, { label: "Body", ops: diffLines("safe", malicious) }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Added");
  });

  it("only includes fields that changed", () => {
    const before = guideContent();
    const after = guideContent({ title: "A different guide title" });
    const diffs = diffGuideContent(before, after);
    expect(diffs.map((diff) => diff.field)).toEqual(["title"]);
  });
});
