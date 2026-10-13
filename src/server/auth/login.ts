import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import { audit } from "@/server/audit";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { clearBucket, isRateLimited, LOGIN_LIMITS, purgeOldEvents, recordEvent } from "./rate-limit";
import { createSession } from "./sessions";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(256),
});

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: string }
  | { ok: false; reason: "invalid" | "rate_limited" };

/**
 * Verifies credentials with per-account and per-IP rate limits. Failure responses do not reveal
 * whether the account exists, is disabled, or the password was wrong.
 */
export async function attemptLogin(
  db: Db,
  input: { email: string; password: string; ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;
  const accountKey = `login:account:${email}`;
  const ipKey = `login:ip:${input.ip ?? "unknown"}`;

  if (Math.random() < 0.02) await purgeOldEvents(db, undefined, now);

  const limited = await db.transaction(async (tx) => {
    const blocked = await isRateLimited(
      tx,
      [
        { key: accountKey, ...LOGIN_LIMITS.perAccount },
        { key: ipKey, ...LOGIN_LIMITS.perIp },
      ],
      now,
    );
    if (!blocked) {
      // Every attempt counts against the account until it succeeds, which clears the bucket.
      await recordEvent(tx, ipKey, now);
      await recordEvent(tx, accountKey, now);
    }
    return blocked;
  });
  if (limited) {
    await audit(db, { actorId: null, action: "auth.login_rate_limited" });
    return { ok: false, reason: "rate_limited" };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordOk = user
    ? await verifyPassword(user.passwordHash, password)
    : await verifyAgainstDummy(password);
  if (!user || !passwordOk || user.disabledAt) {
    await audit(db, { actorId: null, action: "auth.login_failed", details: { knownAccount: Boolean(user) } });
    return { ok: false, reason: "invalid" };
  }

  await clearBucket(db, accountKey);
  const session = await createSession(db, user.id, input.userAgent, now);
  await audit(db, {
    actorId: user.id,
    action: "auth.login_succeeded",
    entityType: "user",
    entityId: user.id,
  });
  return { ok: true, token: session.token, expiresAt: session.expiresAt, userId: user.id };
}
