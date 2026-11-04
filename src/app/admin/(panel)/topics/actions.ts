"use server";

import { revalidatePath } from "next/cache";
import { actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { createTopic } from "@/server/topics";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export type CreateTopicState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
  topic?: { id: string; name: string; slug: string };
} | null;

export async function createTopicAction(
  _previous: CreateTopicState,
  formData: FormData,
): Promise<CreateTopicState> {
  try {
    const session = await requireAction(formData, "topic.manage");
    const created = await createTopic(getDb(), session.user, {
      name: field(formData, "name"),
      description: field(formData, "description"),
    });
    revalidatePath("/admin/topics");
    revalidatePath("/admin/guides");
    revalidatePath("/admin/guides/new");
    revalidatePath("/admin/guides/[id]", "page");
    return { ok: true, message: "Topic added.", topic: created };
  } catch (error) {
    return actionError(error);
  }
}
