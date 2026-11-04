"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { deleteMedia } from "@/server/media";
import { UserInputError } from "@/server/users";

export async function deleteMediaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "media.delete");
    const mediaId = formData.get("mediaId");
    const parsed = z.uuid().safeParse(typeof mediaId === "string" ? mediaId : "");
    if (!parsed.success) throw new UserInputError("That file is not in the library.");
    await deleteMedia(getDb(), session.user, parsed.data);
    revalidatePath("/admin/media");
    return { ok: true, message: "Image deleted." };
  } catch (error) {
    return actionError(error);
  }
}
