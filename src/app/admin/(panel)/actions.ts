"use server";

import { redirect } from "next/navigation";
import { audit } from "@/server/audit";
import { clearSessionCookie, requireAction } from "@/server/auth/request";
import { revokeSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db";

export async function logoutAction(formData: FormData): Promise<void> {
  try {
    const session = await requireAction(formData);
    const db = getDb();
    await revokeSession(db, session.id);
    await audit(db, {
      actorId: session.user.id,
      action: "auth.logout",
      entityType: "user",
      entityId: session.user.id,
    });
  } catch {
    // An invalid or expired session still ends with the cookie cleared and the login page.
  }
  await clearSessionCookie();
  redirect("/admin/login");
}
