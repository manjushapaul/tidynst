import { ImageRejectError, MEDIA_MAX_BYTES, uploadLengthProblem } from "@/lib/media/inspect-image";
import { ZodError } from "zod";
import { AuthorizationError, can } from "@/server/auth/permissions";
import { ActionSecurityError, assertSameOrigin, getSession } from "@/server/auth/request";
import { safeEqual } from "@/server/auth/tokens";
import { getDb } from "@/server/db";
import { uploadMedia } from "@/server/media";
import { UserInputError } from "@/server/users";

function json(status: number, body: { ok: boolean; message?: string; asset?: unknown }) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Dedicated route so a 5 MB image is not forced through the 1 MB Server Action body limit.
 * The declared length is checked before the body is parsed.
 */
export async function POST(request: Request) {
  const lengthProblem = uploadLengthProblem(request.headers.get("content-length"));
  if (lengthProblem === "too_large")
    return json(413, { ok: false, message: "Images must be 5 MB or smaller." });
  if (lengthProblem) return json(411, { ok: false, message: "The upload did not include its size." });

  try {
    await assertSameOrigin();
  } catch (error) {
    const message = error instanceof ActionSecurityError ? error.message : "Cross-origin request rejected.";
    return json(403, { ok: false, message });
  }

  const session = await getSession();
  if (!session) return json(401, { ok: false, message: "Your session has expired. Please sign in again." });
  if (!can(session.user, "media.upload")) {
    return json(403, { ok: false, message: "You do not have permission to do that." });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, message: "The upload could not be read." });
  }

  const token = form.get("csrf");
  if (typeof token !== "string" || !safeEqual(token, session.csrfToken)) {
    return json(403, { ok: false, message: "The form has expired. Reload the page and try again." });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { ok: false, message: "Choose an image file." });
  if (file.size > MEDIA_MAX_BYTES)
    return json(413, { ok: false, message: "Images must be 5 MB or smaller." });
  const altText = form.get("altText");

  try {
    const asset = await uploadMedia(getDb(), session.user, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type,
      altText: typeof altText === "string" ? altText : "",
    });
    return json(200, {
      ok: true,
      message: asset.duplicate ? "That image is already in the library." : "Image uploaded.",
      asset,
    });
  } catch (error) {
    if (
      error instanceof UserInputError ||
      error instanceof AuthorizationError ||
      error instanceof ImageRejectError ||
      error instanceof ZodError
    ) {
      const message =
        error instanceof ZodError
          ? (error.issues[0]?.message ?? "Check the form and try again.")
          : error.message;
      return json(400, { ok: false, message });
    }
    console.error("Media upload failed:", error instanceof Error ? error.message : error);
    return json(500, { ok: false, message: "Something went wrong. Please try again." });
  }
}
