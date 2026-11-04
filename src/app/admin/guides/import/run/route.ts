import { revalidatePath } from "next/cache";
import { can } from "@/server/auth/permissions";
import { ActionSecurityError, assertSameOrigin, getSession } from "@/server/auth/request";
import { safeEqual } from "@/server/auth/tokens";
import { getDb } from "@/server/db";
import { UserInputError } from "@/server/users";
import {
  applyWordImport,
  planWordImport,
  readWordArticles,
  WORD_IMPORT_MAX_BYTES,
} from "@/server/word-import";

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const TOO_LARGE = `Word documents must be ${WORD_IMPORT_MAX_BYTES / 1024 / 1024} MB or smaller.`;

/**
 * Previews or runs a Word import. A route rather than a Server Action so a document with pictures
 * is not held to the 1 MB Server Action body limit.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > WORD_IMPORT_MAX_BYTES + 64 * 1024) {
    return json(413, { ok: false, message: TOO_LARGE });
  }

  try {
    await assertSameOrigin();
  } catch (error) {
    const message = error instanceof ActionSecurityError ? error.message : "Cross-origin request rejected.";
    return json(403, { ok: false, message });
  }
  const session = await getSession();
  if (!session) return json(401, { ok: false, message: "Your session has expired. Please sign in again." });
  if (!can(session.user, "guide.create")) {
    return json(403, { ok: false, message: "You do not have permission to import articles." });
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
  if (!(file instanceof File) || file.size === 0)
    return json(400, { ok: false, message: "Choose a Word document." });
  if (file.size > WORD_IMPORT_MAX_BYTES) return json(413, { ok: false, message: TOO_LARGE });
  const apply = form.get("mode") === "apply";
  const options = { submitForReview: form.get("submitForReview") === "on" };

  try {
    const db = getDb();
    const batch = readWordArticles(new Uint8Array(await file.arrayBuffer()));
    if (!apply) {
      return json(200, {
        ok: true,
        problems: batch.problems,
        plan: await planWordImport(db, session.user, batch, options),
      });
    }
    const results = await applyWordImport(db, session.user, batch, options);
    revalidatePath("/admin/guides");
    for (const result of results) {
      if (result.guideId) revalidatePath(`/admin/guides/${result.guideId}`);
    }
    return json(200, { ok: true, problems: batch.problems, results });
  } catch (error) {
    if (error instanceof UserInputError) return json(400, { ok: false, message: error.message });
    console.error("Word import failed:", error instanceof Error ? error.message : error);
    return json(500, { ok: false, message: "Something went wrong. Please try again." });
  }
}
