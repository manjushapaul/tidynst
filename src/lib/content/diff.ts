import { describeArticleImageStyle } from "./article-image-style";
import { describeFeaturedImageStyle } from "./featured-image-style";
import type { GuideContent } from "./guide-schema";

export type DiffOp = { type: "context" | "added" | "removed"; text: string };

export type FieldDiff = { field: keyof GuideContent; label: string; ops: DiffOp[] };

const FIELD_LABELS: Array<[keyof GuideContent, string]> = [
  ["title", "Title"],
  ["slug", "Address"],
  ["excerpt", "Summary"],
  ["category", "Category"],
  ["subcategoryId", "Topic"],
  ["subcategoryGroupId", "Subcategory"],
  ["topicIds", "Topics"],
  ["products", "Products"],
  ["seoTitle", "SEO title"],
  ["seoDescription", "Meta description"],
  ["featuredImageId", "Featured image"],
  ["featuredImageAlt", "Featured image alt text"],
  ["featuredImageStyle", "Featured image framing"],
  ["articleImageStyle", "Section images"],
  ["body", "Body"],
  ["closing", "Final thoughts"],
  ["faqs", "FAQ"],
];

/** Line diff. Large inputs fall back to a single replacement so the page stays responsive. */
export function diffLines(before: string, after: string): DiffOp[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > 1_000_000) {
    return [
      ...a.map((text) => ({ type: "removed" as const, text })),
      ...b.map((text) => ({ type: "added" as const, text })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "context", text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "removed", text: a[i]! });
      i += 1;
    } else {
      ops.push({ type: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "removed", text: a[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "added", text: b[j]! });
    j += 1;
  }
  return ops;
}

function displayValue(content: GuideContent, field: keyof GuideContent): string {
  if (field === "topicIds") return [...content.topicIds].sort().join("\n");
  if (field === "products") {
    return content.products
      .map((item) => `${item.productId}${item.note ? ` — ${item.note}` : ""}`)
      .join("\n");
  }
  if (field === "faqs") {
    return content.faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join("\n\n");
  }
  if (field === "articleImageStyle") return describeArticleImageStyle(content.articleImageStyle);
  if (field === "featuredImageStyle") return describeFeaturedImageStyle(content.featuredImageStyle);
  const value = content[field];
  if (value === null || value === undefined) return "";
  return String(value);
}

export function diffGuideContent(before: GuideContent, after: GuideContent): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const [field, label] of FIELD_LABELS) {
    const left = displayValue(before, field);
    const right = displayValue(after, field);
    if (left === right) continue;
    diffs.push({ field, label, ops: diffLines(left, right) });
  }
  return diffs;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
