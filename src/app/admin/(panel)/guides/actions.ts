"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { GuideFormError } from "@/server/guides/errors";
import { createGuide, deleteGuide, restoreGuide, saveGuide } from "@/server/guides/workflow";
import { getDb } from "@/server/db";
import { UserInputError } from "@/server/users";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function jsonList(formData: FormData, name: "products" | "faqs", what: string): unknown[] {
  const raw = formData.get(name);
  let value: unknown = [];
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      value = null;
    }
  }
  if (!Array.isArray(value)) {
    throw new GuideFormError(`The ${what} list could not be read. Add the ${what}s again.`, {
      [name]: `The ${what} list could not be read.`,
    });
  }
  return value;
}

/** Missing settings fall back to the defaults when the content is parsed. */
function imageStyle(
  formData: FormData,
  name: "articleImageStyle" | "featuredImageStyle",
  what: string,
): unknown {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new GuideFormError(`The ${what} settings could not be read. Choose them again.`, {
      [name]: `The ${what} settings could not be read.`,
    });
  }
}

function guideInput(formData: FormData): unknown {
  const products = jsonList(formData, "products", "product");
  const faqs = jsonList(formData, "faqs", "FAQ");
  const category = field(formData, "category");
  const featured = field(formData, "featuredImageId");
  return {
    title: field(formData, "title"),
    slug: field(formData, "slug"),
    excerpt: field(formData, "excerpt"),
    body: field(formData, "body"),
    closing: field(formData, "closing"),
    category: category || null,
    subcategoryId: field(formData, "subcategoryId") || null,
    subcategoryGroupId: field(formData, "subcategoryGroupId") || null,
    topicIds: formData
      .getAll("topicIds")
      .filter((value): value is string => typeof value === "string" && value !== ""),
    products,
    seoTitle: field(formData, "seoTitle"),
    seoDescription: field(formData, "seoDescription"),
    featuredImageId: featured || null,
    featuredImageAlt: field(formData, "featuredImageAlt"),
    featuredImageStyle: imageStyle(formData, "featuredImageStyle", "featured image"),
    faqs,
    articleImageStyle: imageStyle(formData, "articleImageStyle", "section image"),
  };
}

function versionOf(formData: FormData): number {
  const parsed = z
    .number()
    .int()
    .positive()
    .safeParse(Number(field(formData, "version")));
  if (!parsed.success) throw new GuideFormError("This page is out of date. Reload it and try again.");
  return parsed.data;
}

function idOf(formData: FormData, name: string): string {
  const parsed = z.uuid().safeParse(field(formData, name));
  if (!parsed.success) throw new UserInputError("Guide not found.");
  return parsed.data;
}

function refreshGuide(id: string) {
  revalidatePath("/admin/guides");
  revalidatePath(`/admin/guides/${id}`);
  revalidatePath(`/admin/guides/${id}/preview`);
  revalidatePath(`/admin/guides/${id}/revisions`);
}

export async function createGuideAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "guide.create");
    const created = await createGuide(getDb(), session.user, guideInput(formData));
    revalidatePath("/admin/guides");
    return {
      ok: true,
      message: "Draft created. It is not published.",
      version: created.version,
      redirectTo: `/admin/guides/${created.id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveGuideAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData);
    const id = idOf(formData, "guideId");
    const saved = await saveGuide(getDb(), session.user, id, versionOf(formData), guideInput(formData));
    refreshGuide(id);
    return {
      ok: true,
      message: saved.changed ? "Draft saved. The published site is unchanged." : "No changes to save.",
      version: saved.version,
      draft: saved.content,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreGuideAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData);
    const id = idOf(formData, "guideId");
    const revisionId = idOf(formData, "revisionId");
    const restored = await restoreGuide(getDb(), session.user, id, revisionId, versionOf(formData));
    refreshGuide(id);
    revalidatePath(`/admin/guides/${id}/revisions/${revisionId}`);
    return {
      ok: true,
      message: "Restored as a new revision. The published guide was not changed.",
      version: restored.version,
      redirectTo: `/admin/guides/${id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteGuideAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "guide.delete");
    const id = idOf(formData, "guideId");
    await deleteGuide(getDb(), session.user, id);
    revalidatePath("/admin/guides");
  } catch (error) {
    return actionError(error);
  }
  // redirect() throws. It stays outside the catch so a successful delete always leaves this page.
  redirect("/admin/guides");
}
