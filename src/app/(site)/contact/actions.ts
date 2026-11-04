"use server";

import { revalidatePath } from "next/cache";
import {
  contactFieldErrors,
  contactFormSchema,
  contactSubject,
  CONTACT_TOPIC_LABELS,
} from "@/lib/content/contact-schema";
import { site } from "@/lib/site";
import type { ActionState } from "@/server/actions";
import { ActionSecurityError, assertSameOrigin, requestMeta } from "@/server/auth/request";
import { saveContactMessage } from "@/server/contact-messages";
import { getDb } from "@/server/db";
import { sendEmail } from "@/server/mail";

const SUCCESS = "Thank you. We have your message and will read it.";

export async function sendContactMessage(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof ActionSecurityError) return { ok: false, message: "Reload the page and try again." };
    throw error;
  }

  // A hidden field. People never fill it; automated senders usually do.
  const trap = formData.get("website");
  if (typeof trap === "string" && trap.trim()) return { ok: true, message: SUCCESS };

  const parsed = contactFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    topic: formData.get("topic"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the form and try again.",
      fieldErrors: contactFieldErrors(parsed.error),
    };
  }

  let saved: Awaited<ReturnType<typeof saveContactMessage>>;
  try {
    saved = await saveContactMessage(getDb(), parsed.data, { ip: (await requestMeta()).ip });
  } catch (error) {
    console.error("Contact message could not be saved:", error instanceof Error ? error.message : error);
    return { ok: false, message: "We could not send your message. Please try again in a little while." };
  }
  if (!saved.saved) {
    return { ok: false, message: "You have sent several messages recently. Please try again later." };
  }
  revalidatePath("/admin/messages");

  // The admin inbox is the record; this email is only a heads-up, so a failure is not the reader's problem.
  const to = site.contactEmail;
  if (to) {
    const { name, email, topic, message } = parsed.data;
    await sendEmail({
      to,
      replyTo: email,
      subject: contactSubject(topic, name),
      text: [
        `${CONTACT_TOPIC_LABELS[topic]} from ${name}`,
        email,
        "",
        message,
        "",
        `Read and reply in the admin: ${new URL(`/admin/messages/${saved.id}`, site.url).toString()}`,
      ].join("\n"),
    }).catch((error: unknown) => {
      console.error("Contact notification failed:", error instanceof Error ? error.message : error);
    });
  }
  return { ok: true, message: SUCCESS };
}
