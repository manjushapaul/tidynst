import "server-only";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Actor } from "./permissions";
import { randomToken, sha256 } from "./tokens";

/** A session ends 24 hours after sign-in, or after 4 hours without activity, whichever is first. */
export const SESSION_ABSOLUTE_MS = 24 * 60 * 60_000;
export const SESSION_IDLE_MS = 4 * 60 * 60_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

export type ValidSession = {
  id: string;
  csrfToken: string;
  expiresAt: Date;
  user: Actor;
};

export async function createSession(
  db: Db,
  userId: string,
  userAgent: string | null,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    csrfToken: randomToken(),
    userAgent: userAgent?.slice(0, 200) ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Resolves a session token to an active session and user. Rejects revoked, expired and idle
 * sessions, and sessions of disabled users. (Password changes and disabling revoke sessions
 * explicitly, so validity never depends on comparing app and database clocks.)
 */
export async function validateSession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<ValidSession | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      id: sessions.id,
      csrfToken: sessions.csrfToken,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sha256(token)))
    .limit(1);
  if (!row) return null;
  if (row.revokedAt || row.disabledAt) return null;
  if (row.expiresAt <= now) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  }
  return {
    id: row.id,
    csrfToken: row.csrfToken,
    expiresAt: row.expiresAt,
    user: { id: row.userId, role: row.role, name: row.name, email: row.email },
  };
}

export async function revokeSession(db: Db, sessionId: string, now = new Date()): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revokes one of the user's own sessions by id; returns false if it is not theirs. */
export async function revokeOwnSession(
  db: Db,
  userId: string,
  sessionId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return result.length > 0;
}

export async function revokeUserSessions(
  db: Db,
  userId: string,
  options: { exceptSessionId?: string; now?: Date } = {},
): Promise<number> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (options.exceptSessionId) conditions.push(ne(sessions.id, options.exceptSessionId));
  const result = await db
    .update(sessions)
    .set({ revokedAt: options.now ?? new Date() })
    .where(and(...conditions))
    .returning({ id: sessions.id });
  return result.length;
}

export async function listActiveSessions(db: Db, userId: string, now = new Date()) {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt));
}
