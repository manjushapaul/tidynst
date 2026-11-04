import type { FieldErrors, GuideContent } from "@/lib/content/guide-schema";

export class GuideFormError extends Error {
  override name = "GuideFormError";
  readonly fieldErrors: FieldErrors;
  constructor(message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export class SaveConflictError extends Error {
  override name = "SaveConflictError";
  readonly guideId: string;
  readonly submitted: GuideContent;
  readonly serverVersion: number;
  constructor(guideId: string, submitted: GuideContent, serverVersion: number) {
    super(
      "Someone else saved this article while you were editing. Your text is still in the form. Reload the page to see the latest version before saving again.",
    );
    this.guideId = guideId;
    this.submitted = submitted;
    this.serverVersion = serverVersion;
  }
}
