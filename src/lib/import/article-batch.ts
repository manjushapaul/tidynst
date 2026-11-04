/**
 * Reads the article template used for Word imports:
 *
 *   === ARTICLE START ===
 *   REFERENCE ONLY (do not send to CMS)      ← optional notes, ignored
 *   ...
 *   CMS FIELDS
 *   title: …            slug: …            excerpt: …
 *   seoTitle: …         seoDescription: …  category: kitchen
 *   subcategory: …      topics: [a, b]     products: [c]
 *   submitForReview: false
 *   body:
 *   …Markdown…
 *   closing:
 *   …Markdown…
 *   faqs:
 *   Q1: question
 *   A1: answer
 *   === ARTICLE END ===
 */

export type ParsedArticle = {
  /** Position in the document, starting at 1. */
  number: number;
  title: string;
  slug: string | null;
  excerpt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  category: string | null;
  subcategory: string | null;
  topics: string[];
  products: { slug: string; note: string | null }[];
  submitForReview: boolean;
  body: string;
  closing: string;
  faqs: { question: string; answer: string }[];
  /** Template mistakes found while reading this article. */
  problems: string[];
};

const START = /^=+\s*ARTICLE\s+START\s*=+$/i;
const END = /^=+\s*ARTICLE\s+END\s*=+$/i;
const CMS_FIELDS = /^CMS\s+FIELDS\s*:?$/i;
const FIELD = /^([A-Za-z]+)\s*:\s?(.*)$/;
const QUESTION = /^Q\s*\d*\s*[:.)]\s*(.*)$/i;
const ANSWER = /^A\s*\d*\s*[:.)]\s*(.*)$/i;

const LINE_FIELDS = {
  title: "title",
  slug: "slug",
  excerpt: "excerpt",
  seotitle: "seoTitle",
  seodescription: "seoDescription",
  category: "category",
  subcategory: "subcategory",
  topics: "topics",
  products: "products",
  submitforreview: "submitForReview",
} as const;
const BLOCK_FIELDS = new Set(["body", "closing", "faqs"]);

type Block = "body" | "closing" | "faqs";

/** `[a, b]`, `a, b` and `["a","b"]` all give ["a", "b"]; `[]` gives none. */
function listValue(value: string): string[] {
  return value
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) =>
      item
        .trim()
        .replace(/^["'“”]|["'“”]$/g, "")
        .trim(),
    )
    .filter(Boolean);
}

function markdownValue(lines: readonly string[]): string {
  return lines
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseArticle(number: number, lines: readonly string[]): ParsedArticle {
  const article: ParsedArticle = {
    number,
    title: "",
    slug: null,
    excerpt: "",
    seoTitle: null,
    seoDescription: null,
    category: null,
    subcategory: null,
    topics: [],
    products: [],
    submitForReview: false,
    body: "",
    closing: "",
    faqs: [],
    problems: [],
  };
  const fieldsStart = lines.findIndex((line) => CMS_FIELDS.test(line.trim()));
  const fieldLines = fieldsStart >= 0 ? lines.slice(fieldsStart + 1) : lines;

  let block: Block | null = null;
  const blockLines: Record<"body" | "closing", string[]> = { body: [], closing: [] };
  let faq: { question: string; answer: string[] } | null = null;
  const finishFaq = () => {
    if (!faq) return;
    const answer = markdownValue(faq.answer);
    if (answer) article.faqs.push({ question: faq.question, answer });
    else article.problems.push(`The FAQ "${faq.question}" has no answer.`);
    faq = null;
  };

  for (const raw of fieldLines) {
    const line = raw.trim();
    const field = FIELD.exec(line);
    const key = field?.[1]?.toLowerCase();

    if (key && BLOCK_FIELDS.has(key) && (block !== null || !(key in LINE_FIELDS))) {
      finishFaq();
      block = key as Block;
      const rest = field?.[2]?.trim();
      if (rest && block !== "faqs") blockLines[block].push(rest);
      continue;
    }

    if (block === "body" || block === "closing") {
      blockLines[block].push(raw.replace(/\s+$/, ""));
      continue;
    }

    if (block === "faqs") {
      const question = QUESTION.exec(line);
      const answer = ANSWER.exec(line);
      if (question) {
        finishFaq();
        faq = { question: question[1]!.trim(), answer: [] };
      } else if (answer && faq) {
        faq.answer.push(answer[1]!);
      } else if (faq) {
        faq.answer.push(raw.replace(/\s+$/, ""));
      } else if (line) {
        article.problems.push(`A line in the FAQs is not a question or answer: "${line.slice(0, 60)}".`);
      }
      continue;
    }

    if (!key || !(key in LINE_FIELDS)) continue;
    const name = LINE_FIELDS[key as keyof typeof LINE_FIELDS];
    const value = field![2]!.trim();
    switch (name) {
      case "title":
      case "excerpt":
        article[name] = value;
        break;
      case "slug":
      case "seoTitle":
      case "seoDescription":
      case "category":
      case "subcategory":
        article[name] = value || null;
        break;
      case "topics":
        article.topics = listValue(value);
        break;
      case "products":
        article.products = listValue(value).map((slug) => ({ slug, note: null }));
        break;
      case "submitForReview":
        article.submitForReview = /^(true|yes)$/i.test(value);
        break;
    }
  }
  finishFaq();

  article.body = markdownValue(blockLines.body);
  article.closing = markdownValue(blockLines.closing);
  if (!article.title) article.problems.push("The article has no title: line.");
  if (!article.body) article.problems.push("The article has no body: section.");
  return article;
}

export type ArticleBatch = { articles: ParsedArticle[]; problems: string[] };

/** Splits a document's paragraphs into articles. Text outside the start and end markers is ignored. */
export function parseArticleBatch(paragraphs: readonly string[]): ArticleBatch {
  const lines = paragraphs.flatMap((paragraph) => paragraph.split(/\r\n?|\n/));
  const articles: ParsedArticle[] = [];
  const problems: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (START.test(trimmed)) {
      if (current) problems.push(`Article ${articles.length + 1} has no === ARTICLE END === line.`);
      if (current) articles.push(parseArticle(articles.length + 1, current));
      current = [];
    } else if (END.test(trimmed)) {
      if (current) articles.push(parseArticle(articles.length + 1, current));
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  if (current) {
    problems.push(`Article ${articles.length + 1} has no === ARTICLE END === line.`);
    articles.push(parseArticle(articles.length + 1, current));
  }
  if (articles.length === 0) {
    problems.push(
      "No articles were found. Each article must sit between === ARTICLE START === and === ARTICLE END ===.",
    );
  }
  return { articles, problems };
}
