"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { replyToContactMessage } from "@/server/contact-messages";
import { getDb } from "@/server/db";
import { getPublicHomepage } from "@/server/homepage";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function replyToMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "message.manage");
    const db = getDb();
    const messageId = field(formData, "messageId");
    const siteName = await getPublicHomepage(db)
      .then((home) => home.name)
      .catch(() => undefined);
    const reply = await replyToContactMessage(
      db,
      session.user,
      messageId,
      { body: field(formData, "body") },
      { siteName },
    );
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${messageId}`);
    return {
      ok: true,
      message: reply.emailed
        ? "Reply sent."
        : "Reply saved, but not emailed: email is not set up on this server (RESEND_API_KEY and EMAIL_FROM). It was written to the server log instead.",
    };
  } catch (error) {
    return actionError(error);
  }
}
