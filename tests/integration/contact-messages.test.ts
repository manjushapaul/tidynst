import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, contactMessages, contactReplies } from "@/db/schema";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import {
  CONTACT_RATE_LIMITS,
  ContactReplyError,
  countUnreadMessages,
  getContactMessage,
  listContactMessages,
  markContactMessageRead,
  replySubject,
  replyToContactMessage,
  saveContactMessage,
} from "@/server/contact-messages";
import type { OutboundEmail } from "@/server/mail";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
const db = () => t.db;
let owner: Actor;
let editor: Actor;
let author: Actor;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

const input = (overrides: Partial<{ name: string; email: string; message: string }> = {}) => ({
  name: "Asha Menon",
  email: "Asha@Example.com",
  topic: "correction" as const,
  message: "The spice guide still mentions a shop that has closed.\nIt was on MG Road.",
  ...overrides,
});

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  editor = asActor(await insertUser(t.db, "editor"));
  author = asActor(await insertUser(t.db, "author"));
});

afterAll(async () => {
  await t.close();
});

describe("contact messages", () => {
  it("stores a message in full and lists it as unread", async () => {
    const saved = await saveContactMessage(db(), input(), { ip: "203.0.113.1" });
    expect(saved.saved).toBe(true);
    if (!saved.saved) return;

    const detail = await getContactMessage(db(), owner, saved.id);
    expect(detail?.email).toBe("asha@example.com");
    expect(detail?.message).toBe(input().message);
    expect(detail?.readAt).toBeNull();

    const list = await listContactMessages(db(), editor, { filter: "unread", page: 1 });
    expect(list.items.map((item) => item.id)).toContain(saved.id);
    expect(await countUnreadMessages(db())).toBeGreaterThan(0);

    await markContactMessageRead(db(), owner, saved.id);
    const unread = await listContactMessages(db(), owner, { filter: "unread", page: 1 });
    expect(unread.items.map((item) => item.id)).not.toContain(saved.id);
  });

  it("limits how many messages one address can send in an hour", async () => {
    const ip = "203.0.113.9";
    for (let n = 0; n < CONTACT_RATE_LIMITS.perIp.limit; n += 1) {
      const result = await saveContactMessage(db(), input({ email: `reader${n}@example.com` }), { ip });
      expect(result.saved).toBe(true);
    }
    const blocked = await saveContactMessage(db(), input({ email: "another@example.com" }), { ip });
    expect(blocked).toEqual({ saved: false, reason: "rate_limited" });
  });

  it("keeps messages away from authors", async () => {
    await expect(listContactMessages(db(), author, { filter: "all", page: 1 })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(await getContactMessage(db(), owner, "not-a-uuid")).toBeNull();
  });

  it("emails a reply, records it, marks the message replied and audits it", async () => {
    const saved = await saveContactMessage(db(), input({ email: "ravi@example.com" }), { ip: null });
    if (!saved.saved) throw new Error("not saved");
    const sent: OutboundEmail[] = [];

    const reply = await replyToContactMessage(
      db(),
      editor,
      saved.id,
      { body: "  Thank you, Ravi. We have updated the guide.  " },
      {
        siteName: "TidyNest",
        send: async (email) => {
          sent.push(email);
          return { delivered: true, mode: "resend" };
        },
      },
    );

    expect(reply.emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ravi@example.com");
    expect(sent[0]?.subject).toBe("Re: Your message to TidyNest");
    expect(sent[0]?.text).toMatch(/^Thank you, Ravi\. We have updated the guide\.\n/);
    expect(sent[0]?.text).toContain(
      "> The spice guide still mentions a shop that has closed.\n> It was on MG Road.",
    );

    const detail = await getContactMessage(db(), owner, saved.id);
    expect(detail?.replies.map((reply) => [reply.body, reply.authorName])).toEqual([
      ["Thank you, Ravi. We have updated the guide.", editor.name],
    ]);
    const [row] = await db().select().from(contactMessages).where(eq(contactMessages.id, saved.id));
    expect(row?.lastRepliedAt).not.toBeNull();
    expect(row?.readAt).not.toBeNull();

    const unanswered = await listContactMessages(db(), owner, { filter: "unanswered", page: 1 });
    expect(unanswered.items.map((item) => item.id)).not.toContain(saved.id);

    const [event] = await db()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "message.replied"), eq(auditEvents.entityId, saved.id)));
    expect(event?.actorId).toBe(editor.id);
    expect(event?.entityType).toBe("message");
  });

  it("records a reply that was only logged because email is not set up, and says it was not emailed", async () => {
    const saved = await saveContactMessage(db(), input({ email: "asha@example.com" }), { ip: null });
    if (!saved.saved) throw new Error("not saved");
    const reply = await replyToContactMessage(
      db(),
      owner,
      saved.id,
      { body: "Thanks, Asha. We will look into it." },
      { send: async () => ({ delivered: true, mode: "dev_log" }) },
    );
    expect(reply.emailed).toBe(false);
    expect((await getContactMessage(db(), owner, saved.id))?.replies).toHaveLength(1);
  });

  it("records nothing when the email is not accepted, and rejects a reply that is too short", async () => {
    const saved = await saveContactMessage(db(), input({ email: "meera@example.com" }), { ip: null });
    if (!saved.saved) throw new Error("not saved");

    await expect(
      replyToContactMessage(
        db(),
        owner,
        saved.id,
        { body: "This reply will not go out." },
        {
          send: async () => ({ delivered: false }),
        },
      ),
    ).rejects.toBeInstanceOf(ContactReplyError);

    const short = await replyToContactMessage(db(), owner, saved.id, { body: "Thanks" }).catch(
      (error: unknown) => error,
    );
    expect(short).toBeInstanceOf(ContactReplyError);
    expect((short as ContactReplyError).fieldErrors.body).toMatch(/at least/);

    await expect(
      replyToContactMessage(db(), author, saved.id, { body: "Authors cannot reply to readers." }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const replies = await db().select().from(contactReplies).where(eq(contactReplies.messageId, saved.id));
    expect(replies).toHaveLength(0);
  });

  it("keeps a sender's name from breaking the reply subject", () => {
    expect(replySubject("Tidy\nNest")).toBe("Re: Your message to Tidy Nest");
  });
});
