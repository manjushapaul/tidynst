import "server-only";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { contactMessages, contactReplies, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  CONTACT_TOPIC_LABELS,
  contactReplySchema,
  type ContactFormInput,
  type ContactTopic,
} from "@/lib/content/contact-schema";
import { formatDateTime } from "@/lib/format";
import { site } from "@/lib/site";
import { audit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/permissions";
import { isRateLimited, recordEvent, type RateLimitRule } from "@/server/auth/rate-limit";
import { type OutboundEmail, sendEmail } from "@/server/mail";

export const MESSAGES_PAGE_SIZE = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CONTACT_RATE_LIMITS = {
  perIp: { limit: 5, windowMs: 60 * 60_000 },
  perEmail: { limit: 5, windowMs: 60 * 60_000 },
  everyone: { limit: 200, windowMs: 24 * 60 * 60_000 },
} as const;

export class ContactReplyError extends Error {
  override name = "ContactReplyError";
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Stores a contact-form message. Limits are per IP address, per sender email and for the whole
 * form, so a flood of submissions cannot fill the database. Keys are hashed by the rate limiter.
 */
export async function saveContactMessage(
  db: Db,
  input: ContactFormInput,
  meta: { ip: string | null },
  now = new Date(),
): Promise<{ saved: true; id: string } | { saved: false; reason: "rate_limited" }> {
  const email = input.email.toLowerCase();
  const rules: RateLimitRule[] = [
    { key: "contact:all", ...CONTACT_RATE_LIMITS.everyone },
    { key: `contact:email:${email}`, ...CONTACT_RATE_LIMITS.perEmail },
    ...(meta.ip ? [{ key: `contact:ip:${meta.ip}`, ...CONTACT_RATE_LIMITS.perIp }] : []),
  ];
  return db.transaction(async (tx) => {
    if (await isRateLimited(tx, rules, now)) return { saved: false, reason: "rate_limited" } as const;
    for (const rule of rules) await recordEvent(tx, rule.key, now);
    const [row] = await tx
      .insert(contactMessages)
      .values({ name: input.name, email, topic: input.topic, message: input.message, createdAt: now })
      .returning({ id: contactMessages.id });
    if (!row) throw new Error("Contact message insert returned no row.");
    return { saved: true, id: row.id } as const;
  });
}

export type MessageFilter = "all" | "unread" | "unanswered";

export type MessageSummary = {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  preview: string;
  createdAt: Date;
  readAt: Date | null;
  lastRepliedAt: Date | null;
};

function filterCondition(filter: MessageFilter): SQL | undefined {
  if (filter === "unread") return isNull(contactMessages.readAt);
  if (filter === "unanswered") return isNull(contactMessages.lastRepliedAt);
  return undefined;
}

export async function listContactMessages(
  db: Db,
  actor: Actor,
  options: { filter: MessageFilter; page: number },
): Promise<{ items: MessageSummary[]; total: number; page: number; pageSize: number }> {
  assertCan(actor, "message.manage");
  const where = filterCondition(options.filter);
  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(where);
  const rows = await db
    .select({
      id: contactMessages.id,
      name: contactMessages.name,
      email: contactMessages.email,
      topic: contactMessages.topic,
      preview: sql<string>`left(${contactMessages.message}, 180)`,
      createdAt: contactMessages.createdAt,
      readAt: contactMessages.readAt,
      lastRepliedAt: contactMessages.lastRepliedAt,
    })
    .from(contactMessages)
    .where(where)
    .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
    .limit(MESSAGES_PAGE_SIZE)
    .offset((options.page - 1) * MESSAGES_PAGE_SIZE);
  return { items: rows, total: counted?.count ?? 0, page: options.page, pageSize: MESSAGES_PAGE_SIZE };
}

export async function countUnreadMessages(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(isNull(contactMessages.readAt));
  return row?.count ?? 0;
}

export type MessageReply = { id: string; body: string; createdAt: Date; authorName: string | null };

export type MessageDetail = {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  createdAt: Date;
  readAt: Date | null;
  replies: MessageReply[];
};

export async function getContactMessage(db: Db, actor: Actor, id: string): Promise<MessageDetail | null> {
  assertCan(actor, "message.manage");
  if (!UUID.test(id)) return null;
  const [message] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
  if (!message) return null;
  const replies = await db
    .select({
      id: contactReplies.id,
      body: contactReplies.body,
      createdAt: contactReplies.createdAt,
      authorName: users.name,
    })
    .from(contactReplies)
    .leftJoin(users, eq(users.id, contactReplies.authorId))
    .where(eq(contactReplies.messageId, id))
    .orderBy(asc(contactReplies.createdAt));
  return {
    id: message.id,
    name: message.name,
    email: message.email,
    topic: message.topic,
    message: message.message,
    createdAt: message.createdAt,
    readAt: message.readAt,
    replies,
  };
}

export async function markContactMessageRead(db: Db, actor: Actor, id: string, now = new Date()) {
  assertCan(actor, "message.manage");
  if (!UUID.test(id)) return;
  await db
    .update(contactMessages)
    .set({ readAt: now })
    .where(and(eq(contactMessages.id, id), isNull(contactMessages.readAt)));
}

/** One line, so a name cannot break the subject of the email. */
export function replySubject(siteName: string): string {
  return `Re: Your message to ${siteName.replace(/[\r\n]+/g, " ").trim()}`;
}

export function replyEmail(
  message: Pick<MessageDetail, "name" | "email" | "topic" | "message" | "createdAt">,
  body: string,
  siteName: string,
): OutboundEmail {
  const quoted = message.message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return {
    to: message.email,
    subject: replySubject(siteName),
    ...(site.contactEmail ? { replyTo: site.contactEmail } : {}),
    text: [
      body,
      "",
      `— ${siteName}`,
      site.url,
      "",
      `On ${formatDateTime(message.createdAt)} you wrote (${CONTACT_TOPIC_LABELS[message.topic].toLowerCase()}):`,
      quoted,
    ].join("\n"),
  };
}

/**
 * Emails a reply to the sender, then records it. Nothing is recorded when the mail service does
 * not accept the message, so the thread only ever shows replies that were actually sent.
 * `emailed` is false when no mail service is configured outside production and the email was
 * only written to the server log.
 */
export async function replyToContactMessage(
  db: Db,
  actor: Actor,
  id: string,
  raw: unknown,
  options: {
    siteName?: string;
    send?: (email: OutboundEmail) => Promise<{ delivered: boolean; mode?: string }>;
  } = {},
): Promise<{ id: string; emailed: boolean }> {
  assertCan(actor, "message.manage");
  const parsed = contactReplySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Check the reply and try again.";
    throw new ContactReplyError(message, { body: message });
  }
  const detail = await getContactMessage(db, actor, id);
  if (!detail) throw new ContactReplyError("This message no longer exists.");

  const send = options.send ?? sendEmail;
  const result = await send(replyEmail(detail, parsed.data.body, options.siteName ?? site.name));
  if (!result.delivered) {
    throw new ContactReplyError("The reply could not be sent. Check the email settings and try again.");
  }

  const recorded = await db.transaction(async (tx) => {
    const now = new Date();
    const [reply] = await tx
      .insert(contactReplies)
      .values({ messageId: id, authorId: actor.id, body: parsed.data.body, createdAt: now })
      .returning({ id: contactReplies.id });
    if (!reply) throw new Error("Contact reply insert returned no row.");
    await tx
      .update(contactMessages)
      .set({ lastRepliedAt: now, readAt: sql`coalesce(${contactMessages.readAt}, ${now})` })
      .where(eq(contactMessages.id, id));
    await audit(tx, { actorId: actor.id, action: "message.replied", entityType: "message", entityId: id });
    return reply;
  });
  return { id: recorded.id, emailed: result.mode !== "dev_log" };
}
