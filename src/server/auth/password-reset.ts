import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { passwordResetTokens, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { absoluteUrl } from "@/lib/site";
import { audit } from "@/server/audit";
import { getHomepageContent } from "@/server/homepage";
import { passwordResetEmail, sendEmail } from "@/server/mail";
import { UserInputError } from "@/server/users";
import {
  clearBucket,
  isRateLimited,
  recordEvent,
  type RateLimitRule,
} from "./rate-limit";
import { hashPassword, passwordProblem, verifyAgainstDummy } from "./password";
import { revokeUserSessions } from "./sessions";
import { randomToken, sha256 } from "./tokens";

export const PASSWORD_RESET_TTL_MS = 60 * 60_000;

export const PASSWORD_RESET_LIMITS = {
  perAccount: { limit: 3, windowMs: 60 * 60_000 },
  perIp: { limit: 10, windowMs: 60 * 60_000 },
} as const;

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const GENERIC_REQUEST_MESSAGE =
  "If that email belongs to an admin account, we have sent a reset link. Check your inbox (and spam folder).";

type RequestOutcome =
  | { kind: "generic" }
  | { kind: "rate_limited" }
  | { kind: "issued"; userId: string; email: string; rawToken: string };

/**
 * Starts a password reset. Always returns the same message whether or not the email exists,
 * so responses cannot be used to discover accounts. Rate limited per email and per IP.
 */
export async function requestPasswordReset(
  db: Db,
  input: { email: string; ip: string | null },
): Promise<{ message: string; /** Test-only: raw token when a reset was issued. */ rawToken?: string }> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) {
    return { message: GENERIC_REQUEST_MESSAGE };
  }
  const email = parsed.data;
  const accountKey = `password-reset:account:${email}`;
  const ipKey = `password-reset:ip:${input.ip ?? "unknown"}`;
  const rules: RateLimitRule[] = [
    { key: accountKey, ...PASSWORD_RESET_LIMITS.perAccount },
    { key: ipKey, ...PASSWORD_RESET_LIMITS.perIp },
  ];

  const outcome: RequestOutcome = await db.transaction(async (tx) => {
    const now = new Date();
    if (await isRateLimited(tx, rules, now)) {
      await audit(tx, {
        actorId: null,
        action: "auth.password_reset_rate_limited",
        entityType: "user",
        details: {},
      });
      return { kind: "rate_limited" };
    }

    const [user] = await tx
      .select({ id: users.id, email: users.email, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    await recordEvent(tx, accountKey, now);
    await recordEvent(tx, ipKey, now);

    if (!user || user.disabledAt) {
      await verifyAgainstDummy("password-reset-timing");
      return { kind: "generic" };
    }

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    const rawToken = randomToken(32);
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      createdAt: now,
    });

    return { kind: "issued", userId: user.id, email: user.email, rawToken };
  });

  if (outcome.kind === "rate_limited") {
    return {
      message: "Too many reset requests. Wait an hour and try again, or sign in if you remember your password.",
    };
  }

  if (outcome.kind === "issued") {
    const resetUrl = absoluteUrl(`/admin/reset-password?token=${encodeURIComponent(outcome.rawToken)}`);
    const brand = (await getHomepageContent(db)).brand.name;
    const delivery = await sendEmail(passwordResetEmail(outcome.email, resetUrl, brand));
    await audit(db, {
      actorId: outcome.userId,
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: outcome.userId,
      details: { delivered: delivery.delivered, mode: delivery.mode },
    });
    return {
      message: GENERIC_REQUEST_MESSAGE,
      ...(process.env.VITEST ? { rawToken: outcome.rawToken } : {}),
    };
  }

  return { message: GENERIC_REQUEST_MESSAGE };
}

/** Returns whether a raw token is still usable (exists, unused, not expired). */
export async function passwordResetTokenIsValid(db: Db, rawToken: string, now = new Date()): Promise<boolean> {
  if (!rawToken || rawToken.length < 20) return false;
  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, sha256(rawToken)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Completes a password reset with a one-time token. Revokes every session for the account.
 */
export async function resetPasswordWithToken(
  db: Db,
  input: { token: string; newPassword: string },
): Promise<void> {
  if (!input.token || input.token.length < 20) {
    throw new UserInputError("That reset link is invalid or has expired.");
  }
  const tokenHash = sha256(input.token);

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`password-reset-use:${tokenHash}`}))`);

    const [tokenRow] = await tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .for("update")
      .limit(1);

    if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt.getTime() <= now.getTime()) {
      throw new UserInputError("That reset link is invalid or has expired.");
    }

    const [user] = await tx.select().from(users).where(eq(users.id, tokenRow.userId)).for("update").limit(1);
    if (!user || user.disabledAt) {
      throw new UserInputError("That reset link is invalid or has expired.");
    }

    const problem = passwordProblem(input.newPassword, { email: user.email, name: user.name });
    if (problem) throw new UserInputError(problem);

    const passwordHash = await hashPassword(input.newPassword);
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, tokenRow.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    await revokeUserSessions(tx, user.id, { now });
    await clearBucket(tx, `password-reset:account:${user.email}`);
    await audit(tx, {
      actorId: user.id,
      action: "auth.password_reset_completed",
      entityType: "user",
      entityId: user.id,
    });
  });
}
