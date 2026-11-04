import { z } from "zod";

export const TOPIC_LIMITS = {
  nameMin: 2,
  nameMax: 60,
  descriptionMin: 20,
  descriptionMax: 200,
} as const;

/** A topic's public name and the description shown on its collection page. */
export const topicContentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(TOPIC_LIMITS.nameMin, `Name must be at least ${TOPIC_LIMITS.nameMin} characters.`)
      .max(TOPIC_LIMITS.nameMax, `Name must be ${TOPIC_LIMITS.nameMax} characters or fewer.`),
    description: z
      .string()
      .trim()
      .min(
        TOPIC_LIMITS.descriptionMin,
        `Description must be at least ${TOPIC_LIMITS.descriptionMin} characters.`,
      )
      .max(
        TOPIC_LIMITS.descriptionMax,
        `Description must be ${TOPIC_LIMITS.descriptionMax} characters or fewer.`,
      ),
  })
  .strict();

export type TopicContent = z.output<typeof topicContentSchema>;

export type TopicFieldErrors = Partial<Record<keyof TopicContent | "form", string>>;

export function topicFieldErrors(error: z.ZodError): TopicFieldErrors {
  const errors: TopicFieldErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] as keyof TopicContent | undefined) ?? "form";
    errors[key] ??= issue.message;
  }
  return errors;
}
