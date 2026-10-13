"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, actionError } from "@/server/actions";
import { audit } from "@/server/audit";
import { requestMeta, requireAction, setSessionCookie } from "@/server/auth/request";
import { revokeOwnSession, revokeUserSessions } from "@/server/auth/sessions";
import { getDb } from "@/server/db";
import { changeOwnPassword, UserInputError } from "@/server/users";

export async function changePasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData);
    const currentPassword = formData.get("currentPassword");
    const newPassword = formData.get("newPassword");
    const confirmPassword = formData.get("confirmPassword");
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      throw new UserInputError("Fill in every field.");
    }
    if (newPassword !== confirmPassword) throw new UserInputError("The new passwords do not match.");
    const { userAgent } = await requestMeta();
    const fresh = await changeOwnPassword(getDb(), session.user, { currentPassword, newPassword, userAgent });
    await setSessionCookie(fresh.token, fresh.expiresAt);
    revalidatePath("/admin/account");
    return { ok: true, message: "Password changed. All other sessions have been signed out." };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData);
    const sessionId = formData.get("sessionId");
    if (typeof sessionId !== "string" || !/^[0-9a-f]{64}$/.test(sessionId))
      throw new UserInputError("Unknown session.");
    if (sessionId === session.id) throw new UserInputError("Use “Sign out” to end this session.");
    const db = getDb();
    if (!(await revokeOwnSession(db, session.user.id, sessionId)))
      throw new UserInputError("Session not found.");
    await audit(db, {
      actorId: session.user.id,
      action: "auth.session_revoked",
      entityType: "user",
      entityId: session.user.id,
    });
    revalidatePath("/admin/account");
    return { ok: true, message: "Session signed out." };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeOtherSessionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireAction(formData);
    const db = getDb();
    const revoked = await revokeUserSessions(db, session.user.id, { exceptSessionId: session.id });
    await audit(db, {
      actorId: session.user.id,
      action: "auth.session_revoked",
      entityType: "user",
      entityId: session.user.id,
      details: { count: revoked },
    });
    revalidatePath("/admin/account");
    return {
      ok: true,
      message: revoked === 1 ? "Signed out 1 other session." : `Signed out ${revoked} other sessions.`,
    };
  } catch (error) {
    return actionError(error);
  }
}
