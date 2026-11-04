import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, passwordResetTokens, sessions, users } from "@/db/schema";
import { attemptLogin } from "@/server/auth/login";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  PASSWORD_RESET_LIMITS,
  PASSWORD_RESET_TTL_MS,
  passwordResetTokenIsValid,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/server/auth/password-reset";
import { createSession, validateSession } from "@/server/auth/sessions";
import { sha256 } from "@/server/auth/tokens";
import { UserInputError } from "@/server/users";
import { createTestDb, type TestDb } from "../support/test-db";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "fresh meadow lantern river";
const GENERIC =
  "If that email belongs to an admin account, we have sent a reset link. Check your inbox (and spam folder).";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function makeOwner(email: string) {
  const [user] = await t.db
    .insert(users)
    .values({
      email,
      name: "QA Owner",
      role: "owner",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  return user!;
}

describe("password reset", () => {
  it("issues a hashed one-time token for an owner and keeps unknown emails opaque", async () => {
    const owner = await makeOwner("reset-owner@example.test");
    const unknown = await requestPasswordReset(t.db, {
      email: "nobody@example.test",
      ip: "10.0.0.1",
    });
    expect(unknown.message).toBe(GENERIC);
    expect(unknown.rawToken).toBeUndefined();
    expect(await t.db.select().from(passwordResetTokens)).toHaveLength(0);

    const issued = await requestPasswordReset(t.db, {
      email: "  Reset-Owner@Example.TEST ",
      ip: "10.0.0.1",
    });
    expect(issued.message).toBe(GENERIC);
    expect(issued.rawToken).toBeTruthy();
    expect(issued.rawToken!.length).toBeGreaterThan(20);

    const [row] = await t.db.select().from(passwordResetTokens);
    expect(row!.userId).toBe(owner.id);
    expect(row!.tokenHash).toBe(sha256(issued.rawToken!));
    expect(row!.tokenHash).not.toBe(issued.rawToken);
    expect(row!.usedAt).toBeNull();
    expect(await passwordResetTokenIsValid(t.db, issued.rawToken!)).toBe(true);
    expect(await passwordResetTokenIsValid(t.db, "not-a-real-token-value-here")).toBe(false);

    const events = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "auth.password_reset_requested"));
    expect(events).toHaveLength(1);
    expect(events[0]?.actorId).toBe(owner.id);
  });

  it("resets the password, revokes sessions, and refuses reuse or expiry", async () => {
    const owner = await makeOwner("reset-complete@example.test");
    const firstSession = await createSession(t.db, owner.id, null);
    const secondSession = await createSession(t.db, owner.id, null);

    const { rawToken } = await requestPasswordReset(t.db, {
      email: owner.email,
      ip: "10.0.0.2",
    });
    expect(rawToken).toBeTruthy();

    await expect(
      resetPasswordWithToken(t.db, { token: rawToken!, newPassword: "tiny" }),
    ).rejects.toThrow(/at least 12/);

    await resetPasswordWithToken(t.db, { token: rawToken!, newPassword: NEW_PASSWORD });

    expect(await validateSession(t.db, firstSession.token)).toBeNull();
    expect(await validateSession(t.db, secondSession.token)).toBeNull();
    const active = await t.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, owner.id), isNull(sessions.revokedAt)));
    expect(active).toHaveLength(0);

    const [stored] = await t.db.select().from(users).where(eq(users.id, owner.id));
    expect(await verifyPassword(stored!.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(stored!.passwordHash, PASSWORD)).toBe(false);

    expect((await attemptLogin(t.db, { email: owner.email, password: PASSWORD, ip: null, userAgent: null })).ok).toBe(
      false,
    );
    expect(
      (await attemptLogin(t.db, { email: owner.email, password: NEW_PASSWORD, ip: null, userAgent: null })).ok,
    ).toBe(true);

    await expect(
      resetPasswordWithToken(t.db, { token: rawToken!, newPassword: "another long passphrase" }),
    ).rejects.toThrow(UserInputError);
    expect(await passwordResetTokenIsValid(t.db, rawToken!)).toBe(false);

    const completed = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.action, "auth.password_reset_completed"), eq(auditEvents.entityId, owner.id)),
      );
    expect(completed).toHaveLength(1);
  });

  it("invalidates prior unused tokens when a new reset is requested", async () => {
    const owner = await makeOwner("reset-rotate@example.test");
    const first = await requestPasswordReset(t.db, { email: owner.email, ip: "10.0.0.3" });
    const second = await requestPasswordReset(t.db, { email: owner.email, ip: "10.0.0.3" });
    expect(await passwordResetTokenIsValid(t.db, first.rawToken!)).toBe(false);
    expect(await passwordResetTokenIsValid(t.db, second.rawToken!)).toBe(true);
  });

  it("treats expired tokens as invalid", async () => {
    const owner = await makeOwner("reset-expired@example.test");
    const { rawToken } = await requestPasswordReset(t.db, { email: owner.email, ip: "10.0.0.4" });
    await t.db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - PASSWORD_RESET_TTL_MS) })
      .where(eq(passwordResetTokens.tokenHash, sha256(rawToken!)));
    expect(await passwordResetTokenIsValid(t.db, rawToken!)).toBe(false);
    await expect(
      resetPasswordWithToken(t.db, { token: rawToken!, newPassword: NEW_PASSWORD }),
    ).rejects.toThrow(/invalid or has expired/);
  });

  it("rate-limits repeated requests for the same account", async () => {
    const owner = await makeOwner("reset-limit@example.test");
    for (let i = 0; i < PASSWORD_RESET_LIMITS.perAccount.limit; i++) {
      const result = await requestPasswordReset(t.db, {
        email: owner.email,
        ip: `10.1.0.${i}`,
      });
      expect(result.message).toBe(GENERIC);
    }
    const limited = await requestPasswordReset(t.db, {
      email: owner.email,
      ip: "10.1.0.99",
    });
    expect(limited.message).toMatch(/Too many reset requests/);
    const events = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "auth.password_reset_rate_limited"));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("does not issue tokens for disabled accounts", async () => {
    const owner = await makeOwner("reset-disabled@example.test");
    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, owner.id));
    const result = await requestPasswordReset(t.db, { email: owner.email, ip: "10.0.0.5" });
    expect(result.message).toBe(GENERIC);
    expect(result.rawToken).toBeUndefined();
    expect(await t.db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, owner.id))).toHaveLength(
      0,
    );
  });
});
