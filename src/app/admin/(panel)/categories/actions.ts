"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/server/actions";
import { actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { updateCategoryIntro } from "@/server/homepage";
import { revalidatePublicContent } from "@/server/revalidate-public";
import {
  createGroup,
  createSubcategory,
  deleteGroup,
  deleteSubcategory,
  updateGroup,
  updateSubcategory,
} from "@/server/subcategories";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function refreshAdmin() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/guides/new");
  revalidatePath("/admin/guides/[id]", "page");
  revalidatePublicContent();
}

export async function updateCategoryIntroAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await updateCategoryIntro(getDb(), session.user, field(formData, "category"), field(formData, "intro"));
    refreshAdmin();
    revalidatePath("/");
    return { ok: true, message: "Description saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createGroupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await createGroup(getDb(), session.user, {
      category: field(formData, "category"),
      name: field(formData, "name"),
      description: field(formData, "description"),
    });
    refreshAdmin();
    return { ok: true, message: "Section added." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateGroupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await updateGroup(getDb(), session.user, field(formData, "id"), {
      name: field(formData, "name"),
      description: field(formData, "description"),
    });
    refreshAdmin();
    return { ok: true, message: "Section saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteGroupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await deleteGroup(getDb(), session.user, field(formData, "id"));
    refreshAdmin();
    return { ok: true, message: "Section removed." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createSubcategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await createSubcategory(getDb(), session.user, field(formData, "groupId"), {
      name: field(formData, "name"),
    });
    refreshAdmin();
    return { ok: true, message: "Subcategory added." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateSubcategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await updateSubcategory(getDb(), session.user, field(formData, "id"), {
      name: field(formData, "name"),
    });
    refreshAdmin();
    return { ok: true, message: "Topic saved. Its address stays the same." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteSubcategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "site.manage");
    await deleteSubcategory(getDb(), session.user, field(formData, "id"));
    refreshAdmin();
    return { ok: true, message: "Subcategory removed." };
  } catch (error) {
    return actionError(error);
  }
}
