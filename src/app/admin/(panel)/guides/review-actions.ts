"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, actionError } from "@/server/actions";
import { requireAction } from "@/server/auth/request";
import { getDb } from "@/server/db";
import {
  decideReview,
  publishGuide,
  type ReviewTarget,
  submitForReview,
  unpublishGuide,
} from "@/server/guides/review";
import { REFRESH_WARNING, revalidatePublicContent } from "@/server/revalidate-public";
import { UserInputError } from "@/server/users";

const STALE = "This page is out of date. Reload it and try again.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function uuidOf(formData: FormData, name: string): string {
  const parsed = z.uuid().safeParse(field(formData, name));
  if (!parsed.success) throw new UserInputError(STALE);
  return parsed.data;
}

function targetOf(formData: FormData): ReviewTarget {
  const version = z.coerce.number().int().positive().safeParse(field(formData, "version"));
  const hash = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .safeParse(field(formData, "contentHash"));
  if (!version.success || !hash.success) throw new UserInputError(STALE);
  return {
    guideId: uuidOf(formData, "guideId"),
    revisionId: uuidOf(formData, "revisionId"),
    version: version.data,
    contentHash: hash.data,
  };
}

/** Runs after the transaction commits, so a refresh failure is logged rather than reported as a failed action. */
function refreshAdmin(guideId: string) {
  try {
    revalidatePath("/admin");
    revalidatePath("/admin/guides");
    revalidatePath("/admin/reviews");
    revalidatePath(`/admin/reviews/${guideId}`);
    revalidatePath(`/admin/guides/${guideId}`);
  } catch (error) {
    console.error("Admin page refresh failed:", error instanceof Error ? error.message : error);
  }
}

export async function submitForReviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "guide.submit");
    const target = targetOf(formData);
    await submitForReview(getDb(), session.user, target);
    refreshAdmin(target.guideId);
    return { ok: true, message: "Submitted for review." };
  } catch (error) {
    return actionError(error);
  }
}

async function decide(formData: FormData, decision: "approved" | "changes_requested"): Promise<ActionState> {
  try {
    const session = await requireAction(formData, "guide.review");
    const target = targetOf(formData);
    const result = await decideReview(getDb(), session.user, {
      ...target,
      decision,
      notes: field(formData, "notes"),
    });
    refreshAdmin(target.guideId);
    if (decision === "changes_requested")
      return { ok: true, message: "Changes requested. The author can see your note." };
    return {
      ok: true,
      message: result.selfApproved
        ? "Approved (self-approval by the owner, recorded in the audit log). You can publish it now."
        : "Approved. It can be published now.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function approveReviewAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return decide(formData, "approved");
}

export async function requestChangesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return decide(formData, "changes_requested");
}

export async function publishGuideAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let published;
  let guideId: string;
  try {
    const session = await requireAction(formData, "guide.publish");
    const target = targetOf(formData);
    guideId = target.guideId;
    published = await publishGuide(getDb(), session.user, target);
  } catch (error) {
    return actionError(error);
  }
  refreshAdmin(guideId);
  const refreshed = revalidatePublicContent({ slug: published.slug });
  return {
    ok: true,
    message: refreshed
      ? "Published. The approved revision is now live."
      : `Published. The approved revision is live. ${REFRESH_WARNING}`,
  };
}

export async function unpublishGuideAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let removed;
  let guideId: string;
  try {
    const session = await requireAction(formData, "guide.publish");
    guideId = uuidOf(formData, "guideId");
    removed = await unpublishGuide(getDb(), session.user, {
      guideId,
      publishedRevisionId: uuidOf(formData, "publishedRevisionId"),
      reason: field(formData, "reason"),
      confirmed: field(formData, "confirm") === "yes",
    });
  } catch (error) {
    return actionError(error);
  }
  refreshAdmin(guideId);
  const refreshed = revalidatePublicContent({ slug: removed.slug });
  return {
    ok: true,
    message: refreshed
      ? "Unpublished. The public page now returns 404; the draft and history are kept."
      : `Unpublished. ${REFRESH_WARNING}`,
  };
}
