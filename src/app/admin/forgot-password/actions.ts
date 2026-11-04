"use server";

import type { ActionState } from "@/server/actions";
import { requestPasswordReset } from "@/server/auth/password-reset";
import { ActionSecurityError, assertSameOrigin, requestMeta } from "@/server/auth/request";
import { getDb } from "@/server/db";

export async function forgotPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof ActionSecurityError) return { ok: false, message: "Reload the page and try again." };
    throw error;
  }

  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, message: "Enter the email address for your admin account." };
  }

  const meta = await requestMeta();
  try {
    const result = await requestPasswordReset(getDb(), { email, ip: meta.ip });
    return { ok: true, message: result.message };
  } catch (error) {
    console.error("Password reset request failed:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Password reset is unavailable right now. Please try again shortly." };
  }
}
