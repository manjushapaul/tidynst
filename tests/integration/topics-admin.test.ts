import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, topics } from "@/db/schema";
import { GUIDE_LIMITS } from "@/lib/content/guide-schema";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { createTopic, listTopics, TopicFormError } from "@/server/topics";
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

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  editor = asActor(await insertUser(t.db, "editor"));
  author = asActor(await insertUser(t.db, "author"));
});

afterAll(async () => {
  await t.close();
});

describe("topics", () => {
  it("lets an owner add a topic beyond the original six", async () => {
    const before = await listTopics(db());
    expect(before).toHaveLength(6);

    const created = await createTopic(db(), owner, {
      name: "Masala storage",
      description: "Ways to keep everyday spices labelled, airtight and away from the stove.",
    });
    expect(created.slug).toBe("masala-storage");

    const after = await listTopics(db());
    expect(after.map((topic) => topic.name)).toContain("Masala storage");
    expect(after).toHaveLength(7);

    const [row] = await db().select().from(topics).where(eq(topics.id, created.id));
    expect(row?.description).toMatch(/airtight/);
    const [event] = await db()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "topic.created"), eq(auditEvents.entityId, created.id)));
    expect(event?.actorId).toBe(owner.id);
    expect(event?.entityType).toBe("topic");
  });

  it("lets an editor add a topic and refuses an author", async () => {
    const created = await createTopic(db(), editor, {
      name: "Under-sink",
      description: "Storage that fits the cupboard under a kitchen or bathroom sink.",
    });
    expect(created.slug).toBe("under-sink");
    await expect(
      createTopic(db(), author, {
        name: "Author topic",
        description: "Authors should not be able to create shared topic collections.",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects a duplicate name and a description that is too short", async () => {
    await expect(
      createTopic(db(), owner, {
        name: "No-drill",
        description: "Another description that is long enough to pass the length check.",
      }),
    ).rejects.toBeInstanceOf(TopicFormError);

    const error = await createTopic(db(), owner, {
      name: "Pantry",
      description: "Too short",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TopicFormError);
    expect((error as TopicFormError).fieldErrors.description).toMatch(/at least/);
  });

  it("allows an article to use more than the previous six-topic cap", () => {
    expect(GUIDE_LIMITS.topicsMax).toBeGreaterThan(6);
  });
});
