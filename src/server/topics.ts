import "server-only";
import { asc } from "drizzle-orm";
import { topics } from "@/db/schema";
import type { Db } from "@/db/types";
import { isValidSlug, slugify } from "@/lib/content/slug";
import {
  topicContentSchema,
  topicFieldErrors,
  type TopicContent,
  type TopicFieldErrors,
} from "@/lib/content/topic-schema";
import { audit } from "@/server/audit";
import { can, type Actor, AuthorizationError } from "@/server/auth/permissions";
import { isUniqueViolation } from "@/server/pg-error";

export class TopicFormError extends Error {
  override name = "TopicFormError";
  readonly fieldErrors: TopicFieldErrors;
  constructor(message: string, fieldErrors: TopicFieldErrors = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export type TopicSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  createdAt: Date;
};

export async function listTopics(db: Db): Promise<TopicSummary[]> {
  return db
    .select({
      id: topics.id,
      slug: topics.slug,
      name: topics.name,
      description: topics.description,
      createdAt: topics.createdAt,
    })
    .from(topics)
    .orderBy(asc(topics.name));
}

/**
 * Adds a topic collection. The address is taken from the name. Topics are reference data shared
 * by every article, so only owners and editors may create them.
 */
export async function createTopic(
  db: Db,
  actor: Actor,
  raw: unknown,
): Promise<{ id: string; name: string; slug: string }> {
  if (!can(actor, "topic.manage")) throw new AuthorizationError();
  const parsed = topicContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TopicFormError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      topicFieldErrors(parsed.error),
    );
  }
  const content: TopicContent = parsed.data;
  const slug = slugify(content.name);
  if (!isValidSlug(slug)) {
    throw new TopicFormError("Use a name made of letters or numbers.", {
      name: "Use a name made of letters or numbers.",
    });
  }

  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(topics)
        .values({ slug, name: content.name, description: content.description })
        .returning({ id: topics.id, name: topics.name, slug: topics.slug });
      if (!created) throw new Error("Topic insert returned no row.");
      await audit(tx, {
        actorId: actor.id,
        action: "topic.created",
        entityType: "topic",
        entityId: created.id,
        details: { slug: created.slug },
      });
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "topics_slug_key")) {
      throw new TopicFormError("A topic with that name already exists.", {
        name: "A topic with that name already exists.",
      });
    }
    throw error;
  }
}
