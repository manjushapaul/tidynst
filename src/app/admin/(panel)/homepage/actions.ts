"use server";

import { revalidatePath } from "next/cache";
import { actionError, type ActionState } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { saveHomepage } from "@/server/homepage";
import { revalidatePublicContent } from "@/server/revalidate-public";

const EXTRA_PATHS = [
  "/about",
  "/editorial-policy",
  "/contact",
  "/privacy",
  "/affiliate-disclosure",
  "/og/default",
];

export async function saveHomepageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await saveHomepage(getDb(), session.user, formData);
    revalidatePublicContent();
    for (const path of EXTRA_PATHS) revalidatePath(path);
    revalidatePath("/admin/homepage");
    return { ok: true, message: "Homepage saved. The public site is using this copy." };
  } catch (error) {
    return actionError(error);
  }
}
