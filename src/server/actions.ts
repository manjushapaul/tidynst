import "server-only";
import { ZodError } from "zod";
import type { GuideContent } from "@/lib/content/guide-schema";
import { AuthorizationError } from "./auth/permissions";
import { ActionSecurityError } from "./auth/request";
import { ContactReplyError } from "./contact-messages";
import { GuideFormError, SaveConflictError } from "./guides/errors";
import { ProductFormError } from "./products";
import { HomepageFormError } from "./homepage";
import { SubcategoryFormError } from "./subcategories";
import { TopicFormError } from "./topics";
import { UserInputError } from "./users";

export type ActionState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
  conflict?: boolean;
  /** Canonical content to put back into the form after a save or a conflict. */
  draft?: GuideContent;
  version?: number;
  redirectTo?: string;
} | null;

/**
 * Converts expected failures into a user-facing message. Unexpected errors are logged on the
 * server and reported generically, so internal details never reach the browser.
 */
export function actionError(error: unknown): ActionState {
  if (error instanceof GuideFormError) {
    return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (
    error instanceof ProductFormError ||
    error instanceof TopicFormError ||
    error instanceof HomepageFormError ||
    error instanceof SubcategoryFormError ||
    error instanceof ContactReplyError
  ) {
    return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof SaveConflictError) {
    return { ok: false, conflict: true, message: error.message, draft: error.submitted };
  }
  if (
    error instanceof ActionSecurityError ||
    error instanceof AuthorizationError ||
    error instanceof UserInputError
  ) {
    return { ok: false, message: error.message };
  }
  if (error instanceof ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
  }
  console.error("Unexpected action error:", error instanceof Error ? error.message : error);
  return { ok: false, message: "Something went wrong. Please try again." };
}
