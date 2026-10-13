"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/server/actions";
import { attemptLogin } from "@/server/auth/login";
import { ActionSecurityError, assertSameOrigin, requestMeta, setSessionCookie } from "@/server/auth/request";
import { getDb } from "@/server/db";

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof ActionSecurityError) return { ok: false, message: "Reload the page and try again." };
    throw error;
  }

  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { ok: false, message: "Enter your email and password." };
  }

  const meta = await requestMeta();
  let result;
  try {
    result = await attemptLogin(getDb(), { email, password, ip: meta.ip, userAgent: meta.userAgent });
  } catch (error) {
    console.error("Login failed unexpectedly:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Sign-in is unavailable right now. Please try again shortly." };
  }

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "rate_limited"
          ? "Too many sign-in attempts. Wait 15 minutes and try again."
          : "That email and password combination is not correct.",
    };
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect("/admin");
}
