import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auditEvents, guideReviews, guideRevisions, guides, users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CategorySlug } from "@/content/categories";
import type { GuideContent } from "@/lib/content/guide-schema";
import { publicationState, type PublicationState, type ReviewState } from "@/lib/content/guide-status";
import { type Actor, can } from "@/server/auth/permissions";
import { collectPublishIssues, revisionContent } from "./review";

export const REVIEW_QUEUE_PAGE_SIZE = 20;
export const REVIEW_HISTORY_LIMIT = 50;
export const REVIEW_QUEUE_STATES = ["in_review", "changes_requested", "approved"] as const;
export type ReviewQueueState = (typeof REVIEW_QUEUE_STATES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const latestSubmission = (column: "created_at" | "actor_id") =>
  sql.raw(`(select a.${column} from audit_events a
    where a.action = 'guide.review_requested' and a.entity_type = 'guide' and a.entity_id = "guides"."id"::text
    order by a.id desc limit 1)`);

export type ReviewQueueItem = {
  id: string;
  title: string;
  category: CategorySlug | null;
  authorName: string;
  revisionNumber: number | null;
  reviewState: ReviewState;
  publication: PublicationState;
  submittedAt: Date | null;
  submitterName: string | null;
  updatedAt: Date;
};

export function normaliseReviewQueueQuery(raw: { state?: string | string[]; page?: string | string[] }) {
  const state = Array.isArray(raw.state) ? raw.state[0] : raw.state;
  const page = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  return {
    state: (REVIEW_QUEUE_STATES as readonly string[]).includes(state ?? "")
      ? (state as ReviewQueueState)
      : ("in_review" as const),
    page: page && /^[1-9]\d{0,3}$/.test(page) ? Number(page) : 1,
  };
}

/** Articles waiting on a reviewer (or, for other tabs, recently decided). Requires `guide.review`. */
export async function listReviewQueue(
  db: Db,
  actor: Actor,
  query: { state: ReviewQueueState; page: number },
): Promise<{ items: ReviewQueueItem[]; total: number; page: number; pageSize: number } | null> {
  if (!can(actor, "guide.review")) return null;
  const pageSize = REVIEW_QUEUE_PAGE_SIZE;
  const where =
    query.state === "approved"
      ? and(
          eq(guides.reviewState, "approved"),
          sql`${guides.currentRevisionId} is distinct from ${guides.publishedRevisionId}`,
        )
      : eq(guides.reviewState, query.state);
  const submitter = alias(users, "submitter");
  const submittedAt = sql<Date | null>`${latestSubmission("created_at")}`.mapWith(guides.updatedAt);
  const [countRow, rows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(guides)
      .where(where),
    db
      .select({
        id: guides.id,
        title: guides.title,
        category: guides.category,
        authorName: users.name,
        revisionNumber: guideRevisions.revisionNumber,
        reviewState: guides.reviewState,
        publishedRevisionId: guides.publishedRevisionId,
        currentRevisionId: guides.currentRevisionId,
        updatedAt: guides.updatedAt,
        submittedAt,
        submitterName: submitter.name,
      })
      .from(guides)
      .innerJoin(users, eq(guides.createdBy, users.id))
      .leftJoin(guideRevisions, eq(guides.currentRevisionId, guideRevisions.id))
      .leftJoin(submitter, sql`${submitter.id} = ${latestSubmission("actor_id")}`)
      .where(where)
      .orderBy(query.state === "in_review" ? asc(submittedAt) : desc(guides.updatedAt), asc(guides.id))
      .limit(pageSize)
      .offset((query.page - 1) * pageSize),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      authorName: row.authorName,
      revisionNumber: row.revisionNumber,
      reviewState: row.reviewState,
      publication: publicationState(row),
      submittedAt: row.submittedAt,
      submitterName: row.submitterName,
      updatedAt: row.updatedAt,
    })),
    total: countRow[0]?.n ?? 0,
    page: query.page,
    pageSize,
  };
}

export type ReviewHistoryEntry =
  | {
      kind: "decision";
      id: string;
      at: Date;
      actorName: string;
      decision: "approved" | "changes_requested";
      notes: string | null;
      revisionNumber: number | null;
      contentHash: string;
    }
  | {
      kind: "event";
      id: string;
      at: Date;
      actorName: string | null;
      action: "guide.review_requested" | "guide.review_invalidated" | "guide.published" | "guide.unpublished";
      revisionNumber: number | null;
      reason: string | null;
    };

const HISTORY_ACTIONS = [
  "guide.review_requested",
  "guide.review_invalidated",
  "guide.published",
  "guide.unpublished",
] as const;

/** Review decisions (from `guide_reviews`) merged with workflow events (from the audit log), newest first. */
export async function reviewHistory(db: Db, guideId: string): Promise<ReviewHistoryEntry[]> {
  const [decisions, events] = await Promise.all([
    db
      .select({
        id: guideReviews.id,
        at: guideReviews.createdAt,
        actorName: users.name,
        decision: guideReviews.decision,
        notes: guideReviews.notes,
        revisionNumber: guideRevisions.revisionNumber,
        contentHash: guideReviews.contentHash,
      })
      .from(guideReviews)
      .innerJoin(users, eq(guideReviews.reviewerId, users.id))
      .leftJoin(guideRevisions, eq(guideReviews.revisionId, guideRevisions.id))
      .where(eq(guideReviews.guideId, guideId))
      .orderBy(desc(guideReviews.createdAt))
      .limit(REVIEW_HISTORY_LIMIT),
    db
      .select({
        id: auditEvents.id,
        at: auditEvents.createdAt,
        actorName: users.name,
        action: auditEvents.action,
        details: auditEvents.details,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(
        and(
          eq(auditEvents.entityType, "guide"),
          eq(auditEvents.entityId, guideId),
          inArray(auditEvents.action, [...HISTORY_ACTIONS]),
        ),
      )
      .orderBy(desc(auditEvents.id))
      .limit(REVIEW_HISTORY_LIMIT),
  ]);
  const entries: ReviewHistoryEntry[] = [
    ...decisions.map((row) => ({ kind: "decision" as const, ...row })),
    ...events.map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      return {
        kind: "event" as const,
        id: String(row.id),
        at: row.at,
        actorName: row.actorName,
        action: row.action as (typeof HISTORY_ACTIONS)[number],
        revisionNumber: typeof details.revisionNumber === "number" ? details.revisionNumber : null,
        reason: typeof details.reason === "string" ? details.reason : null,
      };
    }),
  ];
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, REVIEW_HISTORY_LIMIT);
}

export type ReviewDetail = {
  id: string;
  version: number;
  reviewState: ReviewState;
  publication: PublicationState;
  authorName: string;
  createdBy: string;
  current: { id: string; number: number; contentHash: string; createdBy: string; content: GuideContent };
  published: { id: string; number: number; content: GuideContent } | null;
  submission: { at: Date; actorId: string | null; actorName: string | null } | null;
  publishIssues: string[];
  /** Whether this actor may approve the current revision (Owner always; Editors not for their own work). */
  canApprove: boolean;
  ownWork: boolean;
  history: ReviewHistoryEntry[];
};

export async function getReviewDetail(db: Db, actor: Actor, guideId: string): Promise<ReviewDetail | null> {
  if (!can(actor, "guide.review") || !UUID.test(guideId)) return null;
  const [guide] = await db
    .select({
      id: guides.id,
      version: guides.version,
      reviewState: guides.reviewState,
      createdBy: guides.createdBy,
      currentRevisionId: guides.currentRevisionId,
      publishedRevisionId: guides.publishedRevisionId,
      authorName: users.name,
    })
    .from(guides)
    .innerJoin(users, eq(guides.createdBy, users.id))
    .where(eq(guides.id, guideId))
    .limit(1);
  if (!guide?.currentRevisionId) return null;
  const revisionIds = [guide.currentRevisionId, guide.publishedRevisionId].filter((id): id is string => !!id);
  const [revisions, submissionRows, history] = await Promise.all([
    db.select().from(guideRevisions).where(inArray(guideRevisions.id, revisionIds)),
    db
      .select({ at: auditEvents.createdAt, actorId: auditEvents.actorId, actorName: users.name })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(
        and(
          eq(auditEvents.action, "guide.review_requested"),
          eq(auditEvents.entityType, "guide"),
          eq(auditEvents.entityId, guide.id),
        ),
      )
      .orderBy(desc(auditEvents.id))
      .limit(1),
    reviewHistory(db, guide.id),
  ]);
  const current = revisions.find((row) => row.id === guide.currentRevisionId);
  if (!current) return null;
  const published = guide.publishedRevisionId
    ? revisions.find((row) => row.id === guide.publishedRevisionId)
    : undefined;
  const content = revisionContent(current);
  const submission = submissionRows[0] ?? null;
  const ownWork = [guide.createdBy, current.createdBy, submission?.actorId].includes(actor.id);
  return {
    id: guide.id,
    version: guide.version,
    reviewState: guide.reviewState,
    publication: publicationState(guide),
    authorName: guide.authorName,
    createdBy: guide.createdBy,
    current: {
      id: current.id,
      number: current.revisionNumber,
      contentHash: current.contentHash,
      createdBy: current.createdBy,
      content,
    },
    published: published
      ? { id: published.id, number: published.revisionNumber, content: revisionContent(published) }
      : null,
    submission,
    publishIssues: await collectPublishIssues(db, content, false),
    canApprove: !ownWork || actor.role === "owner",
    ownWork,
    history,
  };
}
