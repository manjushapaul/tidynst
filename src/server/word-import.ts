import "server-only";
import { eq, sql } from "drizzle-orm";
import { guides } from "@/db/schema";
import type { Db } from "@/db/types";
import { carryOverImages } from "@/lib/content/body-images";
import {
  fieldErrorsFrom,
  guideContentSchema,
  type GuideContent,
  type GuideContentInput,
} from "@/lib/content/guide-schema";
import { slugify } from "@/lib/content/slug";
import { type ArticleBatch, type ParsedArticle, parseArticleBatch } from "@/lib/import/article-batch";
import { DocxReadError, docxParagraphs } from "@/lib/import/docx";
import { AuthorizationError, can, type Actor } from "@/server/auth/permissions";
import { AutomationError, resolveCatalogNames } from "@/server/automation";
import { GuideFormError, SaveConflictError } from "@/server/guides/errors";
import { getEditableGuide } from "@/server/guides/queries";
import { submitForReview } from "@/server/guides/review";
import { createGuide, saveGuide } from "@/server/guides/workflow";
import { UserInputError } from "@/server/users";

/**
 * Imports articles from a Word document written in the article template (see
 * src/lib/import/article-batch.ts). An article whose title matches an existing one updates it as a
 * new draft revision; any other article becomes a new draft. Nothing is ever published.
 */

export const WORD_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export function readWordArticles(bytes: Uint8Array): ArticleBatch {
  try {
    return parseArticleBatch(docxParagraphs(bytes));
  } catch (error) {
    if (error instanceof DocxReadError) throw new UserInputError(error.message);
    throw error;
  }
}

export type ImportOptions = { submitForReview: boolean };

export type ImportPlanItem = {
  number: number;
  title: string;
  action: "create" | "update" | "skip";
  guideId: string | null;
  published: boolean;
  notes: string[];
  problems: string[];
};

type PlannedArticle = ImportPlanItem & {
  content: GuideContentInput | null;
  version: number | null;
  submit: boolean;
};

type Names = Awaited<ReturnType<typeof resolveCatalogNames>>;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function newContent(article: ParsedArticle, names: Names): GuideContentInput {
  return {
    title: article.title,
    slug: article.slug || slugify(article.title),
    excerpt: article.excerpt,
    body: article.body,
    closing: article.closing,
    category: names.category,
    subcategoryId: names.subcategoryId,
    subcategoryGroupId: names.subcategoryGroupId,
    topicIds: names.topicIds,
    products: names.products,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    featuredImageId: null,
    featuredImageAlt: null,
    faqs: article.faqs,
  };
}

/** The document's fields over the article's current content, keeping its images and address. */
function updatedContent(
  existing: GuideContent,
  article: ParsedArticle,
  names: Names,
): { content: GuideContentInput; notes: string[] } {
  const notes: string[] = [];
  const body = article.body
    ? carryOverImages(existing.body, article.body)
    : { markdown: existing.body, carried: 0, atEnd: 0 };
  const closing = article.closing
    ? carryOverImages(existing.closing, article.closing)
    : { markdown: existing.closing, carried: 0, atEnd: 0 };
  const carried = body.carried + closing.carried;
  if (carried) notes.push(`Keeps ${plural(carried, "image")} already added in the editor.`);
  const atEnd = body.atEnd + closing.atEnd;
  if (atEnd) notes.push(`${plural(atEnd, "image")} moved to the end because its section heading changed.`);
  if (existing.featuredImageId) notes.push("Keeps the featured image.");
  if (article.slug && article.slug !== existing.slug) {
    notes.push(`Keeps its address "${existing.slug}" (the document says "${article.slug}").`);
  }

  const category = names.category ?? existing.category;
  const categoryChanged = category !== existing.category;
  let subcategoryGroupId = names.subcategoryGroupId ?? existing.subcategoryGroupId;
  let subcategoryId = names.subcategoryGroupId ? names.subcategoryId : existing.subcategoryId;
  if (categoryChanged && !names.subcategoryGroupId) {
    subcategoryGroupId = null;
    subcategoryId = null;
    notes.push("Category changed, so the subcategory was cleared.");
  }
  if (!article.topics.length && existing.topicIds.length) notes.push("Keeps its topics (none listed).");
  if (!article.products.length && existing.products.length) notes.push("Keeps its products (none listed).");
  if (!article.faqs.length && existing.faqs.length) notes.push("Keeps its FAQs (none listed).");

  return {
    notes,
    content: {
      ...existing,
      title: article.title,
      excerpt: article.excerpt || existing.excerpt,
      body: body.markdown,
      closing: closing.markdown,
      category,
      subcategoryId,
      subcategoryGroupId,
      topicIds: article.topics.length ? names.topicIds : existing.topicIds,
      products: article.products.length ? names.products : existing.products,
      seoTitle: article.seoTitle ?? existing.seoTitle,
      seoDescription: article.seoDescription ?? existing.seoDescription,
      faqs: article.faqs.length ? article.faqs : existing.faqs,
    },
  };
}

function contentProblems(content: GuideContentInput): string[] {
  const parsed = guideContentSchema.safeParse(content);
  return parsed.success ? [] : [...new Set(Object.values(fieldErrorsFrom(parsed.error)))];
}

async function planArticle(
  db: Db,
  actor: Actor,
  article: ParsedArticle,
  options: ImportOptions,
): Promise<PlannedArticle> {
  const problems = [...article.problems];
  const planned: PlannedArticle = {
    number: article.number,
    title: article.title || `Article ${article.number}`,
    action: "skip",
    guideId: null,
    published: false,
    notes: [],
    problems,
    content: null,
    version: null,
    submit: options.submitForReview || article.submitForReview,
  };

  let names: Names | null = null;
  try {
    names = await resolveCatalogNames(db, article);
  } catch (error) {
    if (!(error instanceof AutomationError)) throw error;
    problems.push(...Object.values(error.fieldErrors));
  }

  const matches = article.title
    ? await db
        .select({ id: guides.id })
        .from(guides)
        .where(sql`lower(trim(${guides.title})) = ${article.title.trim().toLowerCase()}`)
    : [];
  if (matches.length > 1) {
    problems.push(
      `${matches.length} articles already have this title, so it is not clear which one to update.`,
    );
  }
  if (problems.length || !names) return planned;

  const match = matches[0];
  if (match) {
    const existing = await getEditableGuide(db, actor, match.id);
    if (!existing) {
      problems.push("An article with this title already exists, but you are not allowed to edit it.");
      return planned;
    }
    const { content, notes } = updatedContent(existing.content, article, names);
    if (existing.publishedRevisionId) {
      notes.unshift("Published: the live article stays as it is until you republish it.");
    }
    problems.push(...contentProblems(content));
    return {
      ...planned,
      action: problems.length ? "skip" : "update",
      guideId: existing.id,
      published: existing.publishedRevisionId !== null,
      notes,
      content,
      version: existing.version,
    };
  }

  if (!can(actor, "guide.create")) {
    problems.push("You are not allowed to create articles.");
    return planned;
  }
  const content = newContent(article, names);
  const [taken] = await db
    .select({ title: guides.title })
    .from(guides)
    .where(eq(guides.slug, content.slug))
    .limit(1);
  if (taken) problems.push(`The address "${content.slug}" is already used by "${taken.title}".`);
  problems.push(...contentProblems(content));
  return { ...planned, action: problems.length ? "skip" : "create", content };
}

function publicItem({
  content: _content,
  version: _version,
  submit: _submit,
  ...item
}: PlannedArticle): ImportPlanItem {
  return item;
}

/** What importing would do, without changing anything. */
export async function planWordImport(
  db: Db,
  actor: Actor,
  batch: ArticleBatch,
  options: ImportOptions,
): Promise<ImportPlanItem[]> {
  const plan: ImportPlanItem[] = [];
  for (const article of batch.articles) plan.push(publicItem(await planArticle(db, actor, article, options)));
  return plan;
}

export type ImportResultItem = {
  number: number;
  title: string;
  outcome: "created" | "updated" | "unchanged" | "skipped" | "failed";
  guideId: string | null;
  inReview: boolean;
  message: string | null;
  notes: string[];
};

function failureMessage(error: unknown): string {
  if (error instanceof GuideFormError) {
    return [...new Set([error.message, ...Object.values(error.fieldErrors)])].join(" ");
  }
  if (
    error instanceof SaveConflictError ||
    error instanceof UserInputError ||
    error instanceof AuthorizationError
  ) {
    return error.message;
  }
  console.error("Word import failed for one article:", error instanceof Error ? error.message : error);
  return "Something went wrong with this article.";
}

async function submitCurrent(db: Db, actor: Actor, guideId: string): Promise<string | null> {
  const [row] = await db
    .select({
      version: guides.version,
      revisionId: guides.currentRevisionId,
      contentHash: guides.contentHash,
      reviewState: guides.reviewState,
    })
    .from(guides)
    .where(eq(guides.id, guideId))
    .limit(1);
  if (!row?.revisionId || row.reviewState === "in_review") return null;
  try {
    await submitForReview(db, actor, {
      guideId,
      version: row.version,
      revisionId: row.revisionId,
      contentHash: row.contentHash,
    });
    return null;
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AuthorizationError) {
      return `Saved, but not submitted for review: ${error.message}`;
    }
    throw error;
  }
}

/** Creates and updates the drafts. Each article succeeds or fails on its own. */
export async function applyWordImport(
  db: Db,
  actor: Actor,
  batch: ArticleBatch,
  options: ImportOptions,
): Promise<ImportResultItem[]> {
  const results: ImportResultItem[] = [];
  for (const article of batch.articles) {
    const plan = await planArticle(db, actor, article, options);
    const base = { number: plan.number, title: plan.title, notes: plan.notes };
    if (plan.action === "skip" || !plan.content) {
      results.push({
        ...base,
        outcome: "skipped",
        guideId: plan.guideId,
        inReview: false,
        message: plan.problems.join(" "),
      });
      continue;
    }
    try {
      let guideId: string;
      let changed = true;
      if (plan.action === "create") {
        guideId = (await createGuide(db, actor, plan.content)).id;
      } else {
        const saved = await saveGuide(db, actor, plan.guideId!, plan.version!, plan.content);
        guideId = saved.id;
        changed = saved.changed;
      }
      const submitMessage = plan.submit && changed ? await submitCurrent(db, actor, guideId) : null;
      results.push({
        ...base,
        outcome: plan.action === "create" ? "created" : changed ? "updated" : "unchanged",
        guideId,
        inReview: plan.submit && changed && submitMessage === null,
        message: submitMessage,
      });
    } catch (error) {
      results.push({
        ...base,
        outcome: "failed",
        guideId: plan.guideId,
        inReview: false,
        message: failureMessage(error),
      });
    }
  }
  return results;
}
