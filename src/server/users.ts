import "server-only";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import { audit } from "./audit";
import { hashPassword, passwordProblem, verifyPassword } from "./auth/password";
import { assertCan, type Actor, AuthorizationError, type Role } from "./auth/permissions";
import { createSession, revokeUserSessions } from "./auth/sessions";

export class UserInputError extends Error {
  override name = "UserInputError";
}

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address."));
const nameSchema = z.string().trim().min(1, "Enter a name.").max(80, "Use at most 80 characters.");
const roleSchema = z.enum(["owner", "editor", "author"]);

export const newUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  password: z.string(),
});

function assertPasswordOk(password: string, context: { email?: string; name?: string }) {
  const problem = passwordProblem(password, context);
  if (problem) throw new UserInputError(problem);
}

async function emailTaken(db: Db, email: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return Boolean(row);
}

/** First-owner bootstrap used by the CLI. Refuses if any owner already exists. */
export async function createFirstOwner(db: Db, input: { email: string; name: string; password: string }) {
  const email = emailSchema.parse(input.email);
  const name = nameSchema.parse(input.name);
  assertPasswordOk(input.password, { email, name });
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [owners] = await tx.select({ n: count() }).from(users).where(eq(users.role, "owner"));
    if ((owners?.n ?? 0) > 0)
      throw new UserInputError("An owner already exists. Additional users are created in the admin.");
    if (await emailTaken(tx, email)) throw new UserInputError("A user with that email already exists.");
    const [user] = await tx
      .insert(users)
      .values({ email, name, role: "owner", passwordHash })
      .returning({ id: users.id });
    await audit(tx, {
      actorId: user!.id,
      action: "user.owner_created",
      entityType: "user",
      entityId: user!.id,
    });
    return user!;
  });
}

export async function createUser(db: Db, actor: Actor, raw: z.input<typeof newUserSchema>) {
  assertCan(actor, "user.manage");
  const input = newUserSchema.parse(raw);
  assertPasswordOk(input.password, input);
  if (await emailTaken(db, input.email)) throw new UserInputError("A user with that email already exists.");
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({ email: input.email, name: input.name, role: input.role, passwordHash })
    .returning({ id: users.id });
  await audit(db, {
    actorId: actor.id,
    action: "user.created",
    entityType: "user",
    entityId: user!.id,
    details: { role: input.role },
  });
  return user!;
}

async function activeOwnerCount(db: Db, excludingUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "owner"), isNull(users.disabledAt), ne(users.id, excludingUserId)));
  return row?.n ?? 0;
}

export async function changeUserRole(db: Db, actor: Actor, userId: string, role: Role) {
  assertCan(actor, "user.manage");
  roleSchema.parse(role);
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw new UserInputError("User not found.");
    if (target.role === role) return;
    if (target.role === "owner" && (await activeOwnerCount(tx, userId)) === 0) {
      throw new UserInputError("There must always be at least one active owner.");
    }
    await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
    // Permissions change immediately: existing sessions are revoked.
    await revokeUserSessions(tx, userId);
    await audit(tx, {
      actorId: actor.id,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      details: { from: target.role, to: role },
    });
  });
}

export async function setUserDisabled(db: Db, actor: Actor, userId: string, disabled: boolean) {
  assertCan(actor, "user.manage");
  if (userId === actor.id && disabled) throw new UserInputError("You cannot disable your own account.");
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw new UserInputError("User not found.");
    if (disabled && target.role === "owner" && (await activeOwnerCount(tx, userId)) === 0) {
      throw new UserInputError("There must always be at least one active owner.");
    }
    await tx
      .update(users)
      .set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (disabled) await revokeUserSessions(tx, userId);
    await audit(tx, {
      actorId: actor.id,
      action: disabled ? "user.disabled" : "user.enabled",
      entityType: "user",
      entityId: userId,
    });
  });
}

/**
 * Changes the actor's own password after re-verifying the current one. Every session for the user
 * is revoked and a fresh session is issued for the current browser.
 */
export async function changeOwnPassword(
  db: Db,
  actor: Actor,
  input: { currentPassword: string; newPassword: string; userAgent: string | null },
) {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!user || user.disabledAt) throw new AuthorizationError();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new UserInputError("Your current password is incorrect.");
  }
  if (input.currentPassword === input.newPassword) throw new UserInputError("Choose a different password.");
  assertPasswordOk(input.newPassword, { email: user.email, name: user.name });
  const passwordHash = await hashPassword(input.newPassword);
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    await revokeUserSessions(tx, user.id, { now });
    const session = await createSession(tx, user.id, input.userAgent, now);
    await audit(tx, {
      actorId: user.id,
      action: "auth.password_changed",
      entityType: "user",
      entityId: user.id,
    });
    return session;
  });
}

export async function listUsers(db: Db, actor: Actor) {
  assertCan(actor, "user.manage");
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.email));
}
