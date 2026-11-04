"use server";

import { redirect } from "next/navigation";
import { actionError, type ActionState } from "@/server/actions";
import { resetPasswordWithToken } from "@/server/auth/password-reset";
import { ActionSecurityError, assertSameOrigin } from "@/server/auth/request";
import { getDb } from "@/server/db";

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof ActionSecurityError) return { ok: false, message: "Reload the page and try again." };
    throw error;
  }

  const token = formData.get("token");
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");
  if (typeof token !== "string" || !token) {
    return { ok: false, message: "That reset link is invalid or has expired." };
  }
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string" || !newPassword) {
    return { ok: false, message: "Enter and confirm your new password." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "The new passwords do not match." };
  }

  try {
    await resetPasswordWithToken(getDb(), { token, newPassword });
  } catch (error) {
    return actionError(error);
  }

  redirect("/admin/login?reset=1");
}
