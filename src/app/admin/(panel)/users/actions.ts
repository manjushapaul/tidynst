"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { changeUserRole, createUser, setUserDisabled } from "@/server/users";

const userIdSchema = z.uuid("Unknown user.");
const roleSchema = z.enum(["owner", "editor", "author"], "Choose a role.");

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "user.manage");
    await createUser(getDb(), session.user, {
      email: field(formData, "email"),
      name: field(formData, "name"),
      role: roleSchema.parse(field(formData, "role")),
      password: field(formData, "password"),
    });
    revalidatePath("/admin/users");
    return { ok: true, message: "User created. Share the temporary password with them privately." };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "user.manage");
    const userId = userIdSchema.parse(field(formData, "userId"));
    await changeUserRole(getDb(), session.user, userId, roleSchema.parse(field(formData, "role")));
    revalidatePath("/admin/users");
    return { ok: true, message: "Role updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function setDisabledAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "user.manage");
    const userId = userIdSchema.parse(field(formData, "userId"));
    const disabled = field(formData, "disabled") === "true";
    await setUserDisabled(getDb(), session.user, userId, disabled);
    revalidatePath("/admin/users");
    return { ok: true, message: disabled ? "User disabled." : "User re-enabled." };
  } catch (error) {
    return actionError(error);
  }
}
