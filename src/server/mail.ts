import "server-only";
import { site } from "@/lib/site";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

/**
 * Sends transactional email when `RESEND_API_KEY` and `EMAIL_FROM` are set.
 * In non-production without those vars, the message is logged (never the password) so local/QA
 * can still exercise the reset flow. Production without mail config fails closed for delivery
 * but callers still treat the request as successful to avoid account enumeration.
 */
export async function sendEmail(message: OutboundEmail): Promise<{ delivered: boolean; mode: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Email send failed:", response.status, detail.slice(0, 200));
      return { delivered: false, mode: "resend_error" };
    }
    return { delivered: true, mode: "resend" };
  }

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    console.error("Email is not configured (set RESEND_API_KEY and EMAIL_FROM).");
    return { delivered: false, mode: "unconfigured" };
  }

  console.info(`[mail:dev] to=${message.to} subject=${message.subject}\n${message.text}`);
  return { delivered: true, mode: "dev_log" };
}

export function passwordResetEmail(to: string, resetUrl: string, name: string = site.name): OutboundEmail {
  return {
    to,
    subject: `${name} password reset`,
    text: [
      `You asked to reset the password for your ${name} admin account.`,
      "",
      "Open this link within the next hour to choose a new password:",
      resetUrl,
      "",
      "If you did not ask for this, you can ignore this message. Your password will stay the same.",
      "",
      `— ${name}`,
    ].join("\n"),
  };
}
