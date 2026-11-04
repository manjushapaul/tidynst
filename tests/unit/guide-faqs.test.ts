import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { faqRows, faqsFromRows } from "@/components/admin/faq-editor";
import { GuideDocument, type GuideDocumentModel } from "@/components/content/guide-document";
import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import { guideContentHash } from "@/lib/content/content-hash";
import { diffGuideContent } from "@/lib/content/diff";
import { GUIDE_LIMITS, guideContentSchema } from "@/lib/content/guide-schema";
import { guideContent } from "../support/fixtures";

const faq = (n: number) => ({ question: `Question ${n}?`, answer: `Answer ${n}.` });

describe("FAQ validation", () => {
  it("defaults to no FAQs and trims questions and answers", () => {
    const { faqs: _omitted, ...withoutFaqs } = guideContent();
    expect(guideContentSchema.parse(withoutFaqs).faqs).toEqual([]);
    const parsed = guideContentSchema.parse(
      guideContent({ faqs: [{ question: "  Can I rent?  ", answer: "\r\nYes.\r\n\r\nAsk first.\r\n" }] }),
    );
    expect(parsed.faqs).toEqual([{ question: "Can I rent?", answer: "Yes.\n\nAsk first." }]);
  });

  it("rejects a FAQ without a question or answer, too many FAQs and unknown keys", () => {
    const issue = (faqs: unknown) => {
      const result = guideContentSchema.safeParse({ ...guideContent(), faqs });
      return result.success ? null : result.error.issues[0];
    };
    expect(issue([{ question: " ", answer: "Yes." }])).toMatchObject({
      path: ["faqs", 0, "question"],
      message: "Each FAQ needs a question.",
    });
    expect(issue([{ question: "Why?", answer: "  " }])?.message).toBe("Each FAQ needs an answer.");
    expect(issue(Array.from({ length: GUIDE_LIMITS.faqsMax + 1 }, (_, n) => faq(n)))?.message).toBe(
      `Add at most ${GUIDE_LIMITS.faqsMax} FAQs.`,
    );
    expect(issue([{ ...faq(1), extra: true }])).not.toBeNull();
    expect(issue([{ question: "Q".repeat(GUIDE_LIMITS.faqQuestionMax + 1), answer: "A" }])).not.toBeNull();
    expect(issue([{ question: "Q", answer: "A".repeat(GUIDE_LIMITS.faqAnswerMax + 1) }])).not.toBeNull();
  });
});

describe("FAQ content hash", () => {
  it("keeps the hash of articles without FAQs unchanged", () => {
    const content = guideContent();
    const legacy = createHash("sha256")
      .update(
        JSON.stringify([
          content.title,
          content.slug,
          content.excerpt,
          content.body,
          content.category,
          [],
          [],
          content.seoTitle,
          content.seoDescription,
          content.featuredImageId,
          content.featuredImageAlt,
        ]),
      )
      .digest("hex");
    expect(guideContentHash(content)).toBe(legacy);
  });

  it("changes when a FAQ is added, edited or reordered", () => {
    const base = guideContentHash(guideContent());
    const one = guideContentHash(guideContent({ faqs: [faq(1), faq(2)] }));
    expect(one).not.toBe(base);
    expect(guideContentHash(guideContent({ faqs: [faq(2), faq(1)] }))).not.toBe(one);
    expect(guideContentHash(guideContent({ faqs: [{ ...faq(1), answer: "Changed." }, faq(2)] }))).not.toBe(
      one,
    );
  });
});

describe("FAQ revision diff", () => {
  it("lists FAQ changes separately from the body", () => {
    const diffs = diffGuideContent(guideContent(), guideContent({ faqs: [faq(1)] }));
    expect(diffs.map((diff) => diff.label)).toEqual(["FAQ"]);
    expect(diffs[0]?.ops.filter((op) => op.type === "added").map((op) => op.text)).toEqual([
      "Q: Question 1?",
      "A: Answer 1.",
    ]);
  });
});

describe("FAQ editor rows", () => {
  it("drops rows left completely blank and keeps the order", () => {
    const rows = faqRows([faq(1), { question: " ", answer: "" }, faq(2), { question: "", answer: "Only" }]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(4);
    expect(faqsFromRows(rows)).toEqual([faq(1), faq(2), { question: "", answer: "Only" }]);
  });
});

describe("FAQ section on the article page", () => {
  const model = (faqs: GuideDocumentModel["faqs"]): GuideDocumentModel => ({
    slug: "faq-render",
    title: "FAQ render",
    excerpt: "Synthetic summary for a render test.",
    body: "## One\n\nText.\n\n## Two\n\nText.",
    closing: "",
    category: "kitchen",
    seoTitle: null,
    seoDescription: null,
    readingMinutes: 1,
    updatedAt: new Date("2026-10-13T00:00:00.000Z"),
    firstPublishedAt: new Date("2026-10-01T00:00:00.000Z"),
    image: null,
    topics: [],
    products: [],
    faqs,
    articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
    featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
  });
  const render = (faqs: GuideDocumentModel["faqs"]) =>
    renderToStaticMarkup(createElement(GuideDocument, { guide: model(faqs) }));

  it("shows no FAQ section or contents entry when there are no FAQs", () => {
    const html = render([]);
    expect(html).not.toContain("Frequently Asked Questions");
    expect(html).not.toContain("article-faq");
  });

  it("gives a short article the full width instead of an empty contents column", () => {
    const short = render([]);
    expect(short).not.toContain("<aside");
    expect(short).not.toContain("16rem");
    const withContents = render([{ question: "Q?", answer: "A." }]);
    expect(withContents).toContain("<aside");
    expect(withContents).toContain("lg:grid-cols-[minmax(0,1fr)_16rem]");
  });

  it("shows each question and answer, in order, and links the section from the contents", () => {
    const html = render([
      { question: "Will it damage tiles?", answer: "No.\n\nIt uses suction." },
      { question: "Is it <b>safe</b>?", answer: "Yes." },
    ]);
    expect(html).toContain('<h2 id="article-faq" class="text-2xl">Frequently Asked Questions</h2>');
    expect(html).toContain('href="#article-faq"');
    expect(html.indexOf("Will it damage tiles?")).toBeLessThan(
      html.indexOf("Is it &lt;b&gt;safe&lt;/b&gt;?"),
    );
    expect(html).toContain('<p class="whitespace-pre-line">No.</p>');
    expect(html).toContain('<p class="whitespace-pre-line">It uses suction.</p>');
    expect(html.match(/<button[^>]*aria-expanded="false"/g)).toHaveLength(2);
  });

  it("renders each question as a collapsed button that controls its answer", () => {
    const html = render([{ question: "Will it damage tiles?", answer: "No." }]);
    const button = html.match(/<button[^>]*aria-controls="([^"]+)"[^>]*>/);
    expect(button?.[0]).toContain('type="button"');
    expect(button?.[0]).toContain('aria-expanded="false"');
    const panel = new RegExp(`<div id="${button?.[1]}" inert=""`);
    expect(html).toMatch(panel);
    expect(html.indexOf("Will it damage tiles?")).toBeLessThan(html.indexOf(">No.</p>"));
  });
});
