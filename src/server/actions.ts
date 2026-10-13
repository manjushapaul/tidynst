import "server-only";
import { ZodError } from "zod";
import { AuthorizationError } from "./auth/permissions";
import { ActionSecurityError } from "./auth/request";
import { UserInputError } from "./users";

export type ActionState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
} | null;

/**
 * Converts expected failures into a user-facing message. Unexpected errors are logged on the
 * server and reported generically, so internal details never reach the browser.
 */
export function actionError(error: unknown): ActionState {
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
