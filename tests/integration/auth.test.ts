import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, rateLimitEvents, sessions, users } from "@/db/schema";
import { attemptLogin } from "@/server/auth/login";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { can, canEditGuide, type Role } from "@/server/auth/permissions";
import { bucketFor, LOGIN_LIMITS } from "@/server/auth/rate-limit";
import {
  createSession,
  listActiveSessions,
  revokeOwnSession,
  revokeSession,
  revokeUserSessions,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  validateSession,
} from "@/server/auth/sessions";
import { safeEqual, sha256 } from "@/server/auth/tokens";
import {
  changeOwnEmail,
  changeOwnPassword,
  changeUserRole,
  createFirstOwner,
  createUser,
  setUserDisabled,
  UserInputError,
} from "@/server/users";
import { createTestDb, type TestDb } from "../support/test-db";

const PASSWORD = "correct horse battery staple";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function makeUser(role: Role, email: string, password = PASSWORD) {
  const [user] = await t.db
    .insert(users)
    .values({ email, name: `${role} user`, role, passwordHash: await hashPassword(password) })
    .returning();
  return { id: user!.id, role: user!.role, name: user!.name, email: user!.email };
}

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(PASSWORD);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, "wrong password entirely")).toBe(false);
    expect(await verifyPassword("not-a-hash", PASSWORD)).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("aaaaaaaaaaaaaaa")).toMatch(/repeat/);
    expect(passwordProblem("password12345")).toMatch(/common words/);
    expect(passwordProblem("meera.sharma-2026!", { email: "meera.sharma@example.com" })).toMatch(/email/);
    expect(passwordProblem(PASSWORD)).toBeNull();
    expect(passwordProblem("x".repeat(129))).toMatch(/at most/);
  });
});

describe("tokens", () => {
  it("compares in constant time and handles length mismatches", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("sessions", () => {
  it("stores only a hash of the token and validates it", async () => {
    const user = await makeUser("editor", "session-basic@example.test");
    const { token } = await createSession(t.db, user.id, "Vitest");
    const [row] = await t.db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row!.id).toBe(sha256(token));
    expect(row!.id).not.toBe(token);

    const session = await validateSession(t.db, token);
    expect(session?.user).toEqual({ id: user.id, role: "editor", name: user.name, email: user.email });
    expect(session?.csrfToken.length).toBeGreaterThan(30);
    expect(await validateSession(t.db, `${token}x`)).toBeNull();
    expect(await validateSession(t.db, undefined)).toBeNull();
    expect(await validateSession(t.db, "x".repeat(500))).toBeNull();
  });

  it("expires after the absolute lifetime and after inactivity", async () => {
    const user = await makeUser("author", "session-expiry@example.test");
    const start = new Date("2026-10-01T00:00:00Z");
    const { token } = await createSession(t.db, user.id, null, start);

    // Activity keeps it alive inside the idle window…
    let now = start;
    for (let i = 0; i < 5; i++) {
      now = new Date(now.getTime() + SESSION_IDLE_MS - 60_000);
      expect(await validateSession(t.db, token, now)).not.toBeNull();
    }
    // …but never past the absolute lifetime.
    expect(
      await validateSession(t.db, token, new Date(start.getTime() + SESSION_ABSOLUTE_MS + 1)),
    ).toBeNull();

    const idle = await createSession(t.db, user.id, null, start);
    expect(
      await validateSession(t.db, idle.token, new Date(start.getTime() + SESSION_IDLE_MS + 1)),
    ).toBeNull();
  });

  it("rejects revoked sessions and sessions of disabled users", async () => {
    const owner = await makeUser("owner", "session-owner@example.test");
    const user = await makeUser("editor", "session-revoke@example.test");
    const a = await createSession(t.db, user.id, null);
    const b = await createSession(t.db, user.id, null);
    const c = await createSession(t.db, user.id, null);

    await revokeSession(t.db, sha256(a.token));
    expect(await validateSession(t.db, a.token)).toBeNull();
    expect(await validateSession(t.db, b.token)).not.toBeNull();

    const kept = await revokeUserSessions(t.db, user.id, { exceptSessionId: sha256(c.token) });
    expect(kept).toBe(1);
    expect(await validateSession(t.db, b.token)).toBeNull();
    expect(await validateSession(t.db, c.token)).not.toBeNull();

    await setUserDisabled(t.db, owner, user.id, true);
    expect(await validateSession(t.db, c.token)).toBeNull();
  });

  it("only lets users revoke their own sessions", async () => {
    const alice = await makeUser("author", "alice@example.test");
    const bob = await makeUser("author", "bob@example.test");
    const bobs = await createSession(t.db, bob.id, null);
    expect(await revokeOwnSession(t.db, alice.id, sha256(bobs.token))).toBe(false);
    expect(await validateSession(t.db, bobs.token)).not.toBeNull();
    expect(await revokeOwnSession(t.db, bob.id, sha256(bobs.token))).toBe(true);
    expect(await listActiveSessions(t.db, bob.id)).toHaveLength(0);
  });
});

describe("login", () => {
  const meta = { ip: "203.0.113.10", userAgent: "Vitest" };

  it("signs in with correct credentials, case-insensitively by email", async () => {
    const user = await makeUser("editor", "login-ok@example.test");
    const result = await attemptLogin(t.db, {
      email: " Login-OK@Example.test ",
      password: PASSWORD,
      ...meta,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const session = await validateSession(t.db, result.token);
    expect(session?.user.id).toBe(user.id);
    const events = await t.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "auth.login_succeeded"), eq(auditEvents.entityId, user.id)));
    expect(events).toHaveLength(1);
  });

  it("gives the same generic failure for unknown accounts, wrong passwords and disabled users", async () => {
    const owner = await makeUser("owner", "login-owner@example.test");
    const disabled = await makeUser("author", "login-disabled@example.test");
    await setUserDisabled(t.db, owner, disabled.id, true);
    await makeUser("author", "login-wrong@example.test");

    const unknown = await attemptLogin(t.db, { email: "nobody@example.test", password: PASSWORD, ...meta });
    const wrong = await attemptLogin(t.db, {
      email: "login-wrong@example.test",
      password: "not the password",
      ...meta,
    });
    const off = await attemptLogin(t.db, {
      email: "login-disabled@example.test",
      password: PASSWORD,
      ...meta,
    });
    const malformed = await attemptLogin(t.db, { email: "not-an-email", password: PASSWORD, ...meta });
    for (const result of [unknown, wrong, off, malformed])
      expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks an account after repeated attempts and resets the counter on success", async () => {
    await makeUser("author", "login-limit@example.test");
    const ip = { ip: "198.51.100.1", userAgent: null };
    const now = new Date();
    for (let i = 0; i < LOGIN_LIMITS.perAccount.limit - 1; i++) {
      expect(
        await attemptLogin(
          t.db,
          { email: "login-limit@example.test", password: "wrong wrong wrong", ...ip },
          now,
        ),
      ).toEqual({ ok: false, reason: "invalid" });
    }
    // The last allowed attempt succeeds and clears the account bucket.
    const ok = await attemptLogin(
      t.db,
      { email: "login-limit@example.test", password: PASSWORD, ...ip },
      now,
    );
    expect(ok.ok).toBe(true);
    const remaining = await t.db
      .select()
      .from(rateLimitEvents)
      .where(eq(rateLimitEvents.bucket, bucketFor("login:account:login-limit@example.test")));
    expect(remaining).toHaveLength(0);

    for (let i = 0; i < LOGIN_LIMITS.perAccount.limit; i++) {
      await attemptLogin(
        t.db,
        { email: "login-limit@example.test", password: "wrong wrong wrong", ...ip },
        now,
      );
    }
    // Even the correct password is refused while the account is rate limited.
    expect(
      await attemptLogin(t.db, { email: "login-limit@example.test", password: PASSWORD, ...ip }, now),
    ).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    // The window passes.
    const later = new Date(now.getTime() + LOGIN_LIMITS.perAccount.windowMs + 1000);
    expect(
      (await attemptLogin(t.db, { email: "login-limit@example.test", password: PASSWORD, ...ip }, later)).ok,
    ).toBe(true);
  });

  it("limits attempts per IP address across accounts", async () => {
    const ip = { ip: "192.0.2.55", userAgent: null };
    const now = new Date();
    for (let i = 0; i < LOGIN_LIMITS.perIp.limit; i++) {
      await attemptLogin(
        t.db,
        { email: `spray${i}@example.test`, password: "guess guess guess", ...ip },
        now,
      );
    }
    expect(
      await attemptLogin(t.db, { email: "spray-final@example.test", password: "x", ...ip }, now),
    ).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    // A different IP is unaffected.
    expect(
      await attemptLogin(
        t.db,
        { email: "spray-final@example.test", password: "x", ip: "192.0.2.56", userAgent: null },
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("never stores raw emails or IP addresses in rate-limit buckets", async () => {
    const rows = await t.db.select({ bucket: rateLimitEvents.bucket }).from(rateLimitEvents);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.bucket).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("serialises concurrent attempts so the account limit cannot be exceeded", async () => {
    await makeUser("author", "login-race@example.test");
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        attemptLogin(
          t.db,
          {
            email: "login-race@example.test",
            password: "wrong wrong wrong",
            ip: `10.0.0.${i}`,
            userAgent: null,
          },
          now,
        ),
      ),
    );
    expect(results.filter((r) => !r.ok && r.reason === "invalid")).toHaveLength(
      LOGIN_LIMITS.perAccount.limit,
    );
  });
});

describe("permissions", () => {
  it("grants each role the expected capabilities", () => {
    const owner = { role: "owner" as const };
    const editor = { role: "editor" as const };
    const author = { role: "author" as const };
    expect(can(owner, "user.manage")).toBe(true);
    expect(can(editor, "user.manage")).toBe(false);
    expect(can(editor, "guide.publish")).toBe(true);
    expect(can(editor, "audit.view")).toBe(true);
    expect(can(author, "guide.publish")).toBe(false);
    expect(can(author, "guide.review")).toBe(false);
    expect(can(author, "product.manage")).toBe(false);
    expect(can(author, "topic.manage")).toBe(false);
    expect(can(editor, "topic.manage")).toBe(true);
    expect(can(owner, "topic.manage")).toBe(true);
    expect(can(author, "audit.view")).toBe(false);
    expect(can(author, "analytics.view")).toBe(false);
    expect(can(editor, "analytics.view")).toBe(true);
    expect(can(owner, "analytics.view")).toBe(true);
    expect(can(author, "site.manage")).toBe(false);
    expect(can(editor, "site.manage")).toBe(true);
    expect(can(owner, "site.manage")).toBe(true);
    expect(can(author, "message.manage")).toBe(false);
    expect(can(editor, "message.manage")).toBe(true);
    expect(can(owner, "message.manage")).toBe(true);
    expect(can(author, "guide.create")).toBe(true);
  });

  it("limits authors to their own guides", () => {
    const author = { id: "a", role: "author" as const };
    expect(canEditGuide(author, { createdBy: "a" })).toBe(true);
    expect(canEditGuide(author, { createdBy: "b" })).toBe(false);
    expect(canEditGuide({ id: "e", role: "editor" }, { createdBy: "b" })).toBe(true);
  });
});

describe("changing your own email", () => {
  it("re-verifies the password, keeps emails unique and signs out every other session", async () => {
    const actor = await makeUser("editor", "email-change@example.test");
    await makeUser("author", "email-taken@example.test");
    const first = await createSession(t.db, actor.id, null);
    const second = await createSession(t.db, actor.id, null);
    const change = (newEmail: string, currentPassword = PASSWORD) =>
      changeOwnEmail(t.db, actor, { currentPassword, newEmail, userAgent: null });

    await expect(change("new-address@example.test", "wrong")).rejects.toThrow(
      /current password is incorrect/,
    );
    await expect(change("not an email")).rejects.toThrow(/valid email/);
    await expect(change(" Email-Change@Example.TEST ")).rejects.toThrow(/already your email/);
    await expect(change("EMAIL-TAKEN@example.test")).rejects.toThrow(/already exists/);
    expect(await validateSession(t.db, first.token)).not.toBeNull();

    const replacement = await change("  New-Address@Example.TEST ");
    const [stored] = await t.db.select().from(users).where(eq(users.id, actor.id));
    expect(stored?.email).toBe("new-address@example.test");
    expect(await validateSession(t.db, first.token)).toBeNull();
    expect(await validateSession(t.db, second.token)).toBeNull();
    expect(await validateSession(t.db, replacement.token)).not.toBeNull();

    const login = (email: string) =>
      attemptLogin(t.db, { email, password: PASSWORD, ip: null, userAgent: null });
    expect((await login("email-change@example.test")).ok).toBe(false);
    expect((await login("new-address@example.test")).ok).toBe(true);

    const events = await t.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "user.email_changed"), eq(auditEvents.entityId, actor.id)));
    expect(events).toHaveLength(1);
    expect(events[0]?.actorId).toBe(actor.id);
    expect(JSON.stringify(events[0]?.details ?? null)).not.toContain("@");
  });

  it("refuses disabled accounts", async () => {
    const actor = await makeUser("author", "email-disabled@example.test");
    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, actor.id));
    await expect(
      changeOwnEmail(t.db, actor, {
        currentPassword: PASSWORD,
        newEmail: "elsewhere@example.test",
        userAgent: null,
      }),
    ).rejects.toThrow();
    const [stored] = await t.db.select().from(users).where(eq(users.id, actor.id));
    expect(stored?.email).toBe("email-disabled@example.test");
  });
});

describe("user management", () => {
  let fresh: TestDb;

  beforeAll(async () => {
    fresh = await createTestDb();
  });

  afterAll(async () => {
    await fresh.close();
  });

  it("creates the first owner once and refuses a second bootstrap", async () => {
    const owner = await createFirstOwner(fresh.db, {
      email: "Owner@Example.test",
      name: "Site Owner",
      password: PASSWORD,
    });
    const [row] = await fresh.db.select().from(users).where(eq(users.id, owner.id));
    expect(row?.email).toBe("owner@example.test");
    expect(row?.role).toBe("owner");
    await expect(
      createFirstOwner(fresh.db, { email: "second@example.test", name: "Second", password: PASSWORD }),
    ).rejects.toThrow(UserInputError);
    await expect(
      createFirstOwner(fresh.db, { email: "weak@example.test", name: "Weak", password: "short" }),
    ).rejects.toThrow(/at least 12/);
  });

  it("lets only owners create users, with unique emails and policy-checked passwords", async () => {
    const [ownerRow] = await fresh.db.select().from(users).where(eq(users.role, "owner"));
    const owner = { id: ownerRow!.id, role: ownerRow!.role, name: ownerRow!.name, email: ownerRow!.email };
    const editor = await createUser(fresh.db, owner, {
      email: "editor@example.test",
      name: "Editor",
      role: "editor",
      password: PASSWORD,
    });
    const editorActor = {
      id: editor.id,
      role: "editor" as const,
      name: "Editor",
      email: "editor@example.test",
    };
    await expect(
      createUser(fresh.db, editorActor, {
        email: "x@example.test",
        name: "X",
        role: "author",
        password: PASSWORD,
      }),
    ).rejects.toThrow(/permission/);
    await expect(
      createUser(fresh.db, owner, {
        email: "EDITOR@example.test",
        name: "Dup",
        role: "author",
        password: PASSWORD,
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      createUser(fresh.db, owner, { email: "y@example.test", name: "Y", role: "author", password: "tiny" }),
    ).rejects.toThrow(/at least 12/);
  });

  it("protects the last active owner and revokes sessions on role change", async () => {
    const [ownerRow] = await fresh.db.select().from(users).where(eq(users.role, "owner"));
    const owner = { id: ownerRow!.id, role: ownerRow!.role, name: ownerRow!.name, email: ownerRow!.email };
    await expect(setUserDisabled(fresh.db, owner, owner.id, true)).rejects.toThrow(/your own account/);
    await expect(changeUserRole(fresh.db, owner, owner.id, "editor")).rejects.toThrow(
      /at least one active owner/,
    );

    const second = await createUser(fresh.db, owner, {
      email: "owner2@example.test",
      name: "Second Owner",
      role: "owner",
      password: PASSWORD,
    });
    const secondSession = await createSession(fresh.db, second.id, null);
    await changeUserRole(fresh.db, owner, second.id, "editor");
    expect(await validateSession(fresh.db, secondSession.token)).toBeNull();
    const [after] = await fresh.db.select().from(users).where(eq(users.id, second.id));
    expect(after?.role).toBe("editor");
  });

  it("changes a password after re-verification and signs out every other session", async () => {
    const [ownerRow] = await fresh.db.select().from(users).where(eq(users.role, "owner"));
    const owner = { id: ownerRow!.id, role: ownerRow!.role, name: ownerRow!.name, email: ownerRow!.email };
    const first = await createSession(fresh.db, owner.id, null);
    const second = await createSession(fresh.db, owner.id, null);

    await expect(
      changeOwnPassword(fresh.db, owner, {
        currentPassword: "wrong",
        newPassword: "a brand new passphrase",
        userAgent: null,
      }),
    ).rejects.toThrow(/current password is incorrect/);

    const replacement = await changeOwnPassword(fresh.db, owner, {
      currentPassword: PASSWORD,
      newPassword: "a brand new passphrase",
      userAgent: null,
    });
    expect(await validateSession(fresh.db, first.token)).toBeNull();
    expect(await validateSession(fresh.db, second.token)).toBeNull();
    expect(await validateSession(fresh.db, replacement.token)).not.toBeNull();

    const login = await attemptLogin(fresh.db, {
      email: owner.email,
      password: "a brand new passphrase",
      ip: null,
      userAgent: null,
    });
    expect(login.ok).toBe(true);

    const actions = (await fresh.db.select({ action: auditEvents.action }).from(auditEvents)).map(
      (e) => e.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "user.owner_created",
        "user.created",
        "user.role_changed",
        "auth.password_changed",
      ]),
    );
  });
});
