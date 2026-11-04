import { z } from "zod";

export const CONTACT_TOPICS = ["question", "correction", "suggestion"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  question: "Question",
  correction: "Correction",
  suggestion: "Suggestion",
};

export const CONTACT_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  messageMin: 20,
  messageMax: 4000,
} as const;

export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(CONTACT_LIMITS.nameMin, "Please enter your name.")
    .max(CONTACT_LIMITS.nameMax, `Name must be ${CONTACT_LIMITS.nameMax} characters or fewer.`),
  email: z.email("Enter a valid email address.").max(254, "That email address is too long."),
  topic: z.enum(CONTACT_TOPICS, "Choose what this message is about."),
  message: z
    .string()
    .trim()
    .min(CONTACT_LIMITS.messageMin, "Please write a little more, so we can understand.")
    .max(CONTACT_LIMITS.messageMax, `Message must be ${CONTACT_LIMITS.messageMax} characters or fewer.`),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

export function contactFieldErrors(error: z.ZodError): Partial<Record<keyof ContactFormInput, string>> {
  const errors: Partial<Record<keyof ContactFormInput, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "name" || key === "email" || key === "topic" || key === "message") {
      errors[key] ??= issue.message;
    }
  }
  return errors;
}

export const CONTACT_REPLY_LIMITS = { min: 10, max: 5000 } as const;

export const contactReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(CONTACT_REPLY_LIMITS.min, `Write at least ${CONTACT_REPLY_LIMITS.min} characters.`)
    .max(CONTACT_REPLY_LIMITS.max, `Keep the reply to ${CONTACT_REPLY_LIMITS.max} characters or fewer.`),
});

/** One line, so a name cannot break the subject of the email. */
export function contactSubject(topic: ContactTopic, name: string): string {
  const safeName = name.replace(/[\r\n]+/g, " ").trim();
  return `TidyNest contact: ${CONTACT_TOPIC_LABELS[topic]} from ${safeName}`;
}
