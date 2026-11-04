"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { createProduct, ProductImpactError, updateProduct } from "@/server/products";
import { REFRESH_WARNING, revalidatePublicContent } from "@/server/revalidate-public";
import { UserInputError } from "@/server/users";

const STALE = "This page is out of date. Reload it and try again.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function productInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    brand: field(formData, "brand"),
    summary: field(formData, "summary"),
    merchantName: field(formData, "merchantName"),
    productUrl: field(formData, "productUrl"),
    verifiedOn: field(formData, "verifiedOn"),
    status: field(formData, "status"),
  };
}

function refreshAdmin(productId?: string) {
  try {
    revalidatePath("/admin/products");
    if (productId) revalidatePath(`/admin/products/${productId}`);
  } catch (error) {
    console.error("Admin page refresh failed:", error instanceof Error ? error.message : error);
  }
}

export async function createProductAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "product.manage");
    const created = await createProduct(getDb(), session.user, productInput(formData));
    refreshAdmin();
    return { ok: true, message: "Product created.", redirectTo: `/admin/products/${created.id}` };
  } catch (error) {
    return actionError(error);
  }
}

/** The published articles the editor confirmed, sent only when the confirmation box is ticked. */
function confirmedArticleIds(formData: FormData): string[] {
  if (field(formData, "confirmImpact") !== "yes") return [];
  return formData
    .getAll("impactArticleIds")
    .filter((value): value is string => typeof value === "string" && z.uuid().safeParse(value).success);
}

export async function updateProductAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let result;
  let productId: string | undefined;
  try {
    const session = await requireAction(formData, "product.manage");
    const id = z.uuid().safeParse(field(formData, "productId"));
    const version = z.coerce.number().int().positive().safeParse(field(formData, "version"));
    if (!id.success || !version.success) throw new UserInputError(STALE);
    productId = id.data;
    result = await updateProduct(
      getDb(),
      session.user,
      productId,
      version.data,
      productInput(formData),
      confirmedArticleIds(formData),
    );
  } catch (error) {
    // Re-render the page so the form lists the articles affected right now.
    if (error instanceof ProductImpactError) refreshAdmin(productId);
    return actionError(error);
  }
  if (!result.changed) return { ok: true, message: "No changes to save.", version: result.version };
  refreshAdmin(productId);
  const refreshed = result.affected.length > 0 ? revalidatePublicContent() : true;
  const message = result.statusChanged ? "Product saved and its status updated." : "Product saved.";
  return {
    ok: true,
    message: refreshed ? message : `${message} ${REFRESH_WARNING}`,
    version: result.version,
  };
}
