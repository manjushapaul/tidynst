import "server-only";
import { randomUUID } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  guideRevisions,
  guides,
  homepageSettings,
  mediaAssets,
  subcategoryGroups,
  type MediaVariantRecord,
} from "@/db/schema";
import { HOMEPAGE_ID, homepageMediaIds, type HomepageContent } from "@/lib/content/homepage-schema";
import type { Db } from "@/db/types";
import { mediaPath } from "@/server/public-content";
import {
  ImageRejectError,
  inspectImage,
  normaliseDeclaredType,
  type MediaContentType,
} from "@/lib/media/inspect-image";
import { optimiseImage } from "@/lib/media/optimize-image";
import { audit } from "@/server/audit";
import { can, type Actor, AuthorizationError } from "@/server/auth/permissions";
import { getMediaObjectStore, type MediaObjectStore } from "@/server/media/object-store";
import { isUniqueViolation } from "@/server/pg-error";
import { UserInputError } from "@/server/users";

const altTextSchema = z
  .string()
  .trim()
  .min(5, "Alt text must be at least 5 characters.")
  .max(200, "Alt text must be 200 characters or fewer.");

export type StoredMedia = {
  id: string;
  filename: string;
  contentType: MediaContentType;
  altText: string;
  width: number;
  height: number;
  byteSize: number;
  src: string;
  duplicate: boolean;
};

const ALLOWED_DECLARED = new Set<string>(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const mediaPathLike = (id: string) => `%/media/${id}/%`;

export type MediaReferenceReport = {
  draftGuideIds: string[];
  publishedGuideIds: string[];
  revisionGuideIds: string[];
  /** The homepage, header logo or a category card still uses this file. */
  homepage: boolean;
  /** A public subcategory button still uses this file. */
  category: boolean;
};

/** Every guide that still points at this asset, plus the homepage when it uses the file. */
export async function findMediaReferences(db: Db, mediaId: string): Promise<MediaReferenceReport> {
  const pattern = mediaPathLike(mediaId);
  const id = mediaId.toLowerCase();
  const [published, drafts, revisions, homepage, category] = await Promise.all([
    db
      .select({ id: guides.id })
      .from(guides)
      .innerJoin(guideRevisions, eq(guideRevisions.id, guides.publishedRevisionId))
      .where(or(eq(guideRevisions.featuredImageId, mediaId), sql`${guideRevisions.body} like ${pattern}`)),
    db
      .select({ id: guides.id })
      .from(guides)
      .where(or(eq(guides.featuredImageId, mediaId), sql`${guides.body} like ${pattern}`)),
    db
      .select({ guideId: guideRevisions.guideId })
      .from(guideRevisions)
      .where(or(eq(guideRevisions.featuredImageId, mediaId), sql`${guideRevisions.body} like ${pattern}`)),
    db
      .select({ content: homepageSettings.content })
      .from(homepageSettings)
      .where(eq(homepageSettings.id, HOMEPAGE_ID))
      .limit(1),
    db.select({ id: subcategoryGroups.id }).from(subcategoryGroups).where(eq(subcategoryGroups.iconMediaId, id)),
  ]);
  const content = homepage[0]?.content;
  return {
    publishedGuideIds: [...new Set(published.map((row) => row.id))],
    draftGuideIds: [...new Set(drafts.map((row) => row.id))],
    revisionGuideIds: [...new Set(revisions.map((row) => row.guideId))],
    homepage: content ? homepageMediaIds(content as HomepageContent).includes(id) : false,
    category: category.length > 0,
  };
}

function referencesBlockDeletion(refs: MediaReferenceReport): boolean {
  return (
    refs.homepage ||
    refs.category ||
    refs.publishedGuideIds.length > 0 ||
    refs.draftGuideIds.length > 0 ||
    refs.revisionGuideIds.length > 0
  );
}

function mediaInUseMessage(refs: MediaReferenceReport): string {
  if (
    refs.homepage &&
    !refs.category &&
    refs.publishedGuideIds.length === 0 &&
    refs.draftGuideIds.length === 0 &&
    refs.revisionGuideIds.length === 0
  ) {
    return "This image is used on the homepage. Choose a different logo or photo there before deleting it.";
  }
  if (
    refs.category &&
    !refs.homepage &&
    refs.publishedGuideIds.length === 0 &&
    refs.draftGuideIds.length === 0 &&
    refs.revisionGuideIds.length === 0
  ) {
    return "This image is used as a subcategory icon. Choose another icon before deleting it.";
  }
  return "This image is still used by an article or revision. Remove it from every draft and published page before deleting it.";
}

async function uploadObjectFiles(
  store: MediaObjectStore,
  assetId: string,
  files: Array<{ filename: string; contentType: string; bytes: Buffer }>,
): Promise<
  Array<{ filename: string; contentType: string; storageKey: string; storageUrl: string; byteSize: number }>
> {
  const uploadedUrls: string[] = [];
  try {
    const out = [];
    for (const file of files) {
      const storageKey = `media/${assetId}/${file.filename}`;
      const put = await store.put(storageKey, file.bytes, file.contentType);
      uploadedUrls.push(put.url);
      out.push({
        filename: file.filename,
        contentType: file.contentType,
        storageKey: put.pathname || storageKey,
        storageUrl: put.url,
        byteSize: file.bytes.byteLength,
      });
    }
    return out;
  } catch (error) {
    await store.deleteUrls(uploadedUrls).catch(() => undefined);
    throw error;
  }
}

function toVariantRecords(
  files: Array<{
    filename: string;
    contentType: string;
    storageKey: string;
    storageUrl: string;
    byteSize: number;
  }>,
  shapes: Array<{ label: string; width: number; height: number }>,
): MediaVariantRecord[] {
  return files.map((file, index) => ({
    label: shapes[index]!.label,
    width: shapes[index]!.width,
    height: shapes[index]!.height,
    byteSize: file.byteSize,
    contentType: file.contentType,
    filename: file.filename,
    storageKey: file.storageKey,
    storageUrl: file.storageUrl,
  }));
}

export async function uploadMedia(
  db: Db,
  actor: Actor,
  input: { bytes: Uint8Array; declaredType: string; altText: string },
): Promise<StoredMedia> {
  if (!can(actor, "media.upload")) throw new AuthorizationError();
  const altText = altTextSchema.parse(input.altText);
  const declared = normaliseDeclaredType(input.declaredType);
  if (!ALLOWED_DECLARED.has(declared)) {
    throw new UserInputError("Use a JPEG, PNG, WebP or AVIF image.");
  }
  let inspected;
  try {
    inspected = await inspectImage(input.bytes);
  } catch (error) {
    if (error instanceof ImageRejectError) throw new UserInputError(error.message);
    throw error;
  }
  if (inspected.contentType !== declared) {
    throw new UserInputError("The file contents do not match the declared image type.");
  }

  const existing = await db
    .select({
      id: mediaAssets.id,
      filename: mediaAssets.filename,
      contentType: mediaAssets.contentType,
      altText: mediaAssets.altText,
      width: mediaAssets.width,
      height: mediaAssets.height,
      byteSize: mediaAssets.byteSize,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.sha256, inspected.sha256))
    .limit(1);
  if (existing[0]) {
    const asset = existing[0];
    await audit(db, {
      actorId: actor.id,
      action: "media.uploaded",
      entityType: "media",
      entityId: asset.id,
      details: { duplicate: true },
    });
    return {
      id: asset.id,
      filename: asset.filename,
      contentType: asset.contentType as MediaContentType,
      altText: asset.altText,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
      src: mediaPath(asset.id, asset.filename),
      duplicate: true,
    };
  }

  let optimised;
  try {
    optimised = await optimiseImage(inspected.bytes, {
      width: inspected.width,
      height: inspected.height,
    });
  } catch (error) {
    if (error instanceof ImageRejectError) throw new UserInputError(error.message);
    throw error;
  }

  const store = getMediaObjectStore();
  const assetId = randomUUID();
  const master = optimised.master;
  const variantShapes = optimised.variants.map((v) => ({
    label: v.label,
    width: v.width,
    height: v.height,
  }));

  let storageProvider: string | null = null;
  let storageKey: string | null = null;
  let storageUrl: string | null = null;
  let data: Buffer | null = null;
  let variants: MediaVariantRecord[] = [];

  if (store) {
    const files = [
      { filename: master.filename, contentType: master.contentType, bytes: master.bytes },
      ...optimised.variants.map((v) => ({
        filename: v.filename,
        contentType: v.contentType,
        bytes: v.bytes,
      })),
    ];
    const uploaded = await uploadObjectFiles(store, assetId, files);
    const [masterUploaded, ...variantUploaded] = uploaded;
    storageProvider = store.provider;
    storageKey = masterUploaded!.storageKey;
    storageUrl = masterUploaded!.storageUrl;
    variants = toVariantRecords(variantUploaded, variantShapes);
  } else {
    // Local/test fallback when Blob is not configured: keep a single master in Postgres.
    data = master.bytes;
  }

  try {
    return await db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(mediaAssets)
        .values({
          id: assetId,
          filename: master.filename,
          contentType: master.contentType,
          byteSize: master.bytes.byteLength,
          width: master.width,
          height: master.height,
          sha256: inspected.sha256,
          data,
          storageProvider,
          storageKey,
          storageUrl,
          variants,
          altText,
          uploadedBy: actor.id,
        })
        .returning({
          id: mediaAssets.id,
          filename: mediaAssets.filename,
          contentType: mediaAssets.contentType,
          altText: mediaAssets.altText,
          width: mediaAssets.width,
          height: mediaAssets.height,
          byteSize: mediaAssets.byteSize,
        });
      if (!asset) throw new Error("Media insert returned no row.");
      await audit(tx, {
        actorId: actor.id,
        action: "media.uploaded",
        entityType: "media",
        entityId: asset.id,
        details: {
          duplicate: false,
          byteSize: master.bytes.byteLength,
          contentType: master.contentType,
          storageProvider: storageProvider ?? "bytea",
          variantCount: variants.length,
        },
      });
      return {
        id: asset.id,
        filename: asset.filename,
        contentType: asset.contentType as MediaContentType,
        altText: asset.altText,
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
        src: mediaPath(asset.id, asset.filename),
        duplicate: false,
      };
    });
  } catch (error) {
    if (store && storageUrl) {
      const urls = [storageUrl, ...variants.map((v) => v.storageUrl)];
      await store.deleteUrls(urls).catch(() => undefined);
    }
    if (!isUniqueViolation(error, "media_assets_sha256_key")) throw error;
    const [asset] = await db
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.filename,
        contentType: mediaAssets.contentType,
        altText: mediaAssets.altText,
        width: mediaAssets.width,
        height: mediaAssets.height,
        byteSize: mediaAssets.byteSize,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.sha256, inspected.sha256))
      .limit(1);
    if (!asset) throw error;
    await audit(db, {
      actorId: actor.id,
      action: "media.uploaded",
      entityType: "media",
      entityId: asset.id,
      details: { duplicate: true },
    });
    return {
      id: asset.id,
      filename: asset.filename,
      contentType: asset.contentType as MediaContentType,
      altText: asset.altText,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
      src: mediaPath(asset.id, asset.filename),
      duplicate: true,
    };
  }
}

/**
 * Deletes a library image only when nothing references it. Featured images, draft bodies,
 * published revisions and historical revisions all block deletion. Object-store files are
 * removed after the database row is deleted.
 */
export async function deleteMedia(db: Db, actor: Actor, mediaId: string): Promise<void> {
  if (!can(actor, "media.delete")) throw new AuthorizationError();
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) throw new UserInputError("That file is not in the library.");

  const refs = await findMediaReferences(db, mediaId);
  if (referencesBlockDeletion(refs)) {
    throw new UserInputError(mediaInUseMessage(refs));
  }

  const store = getMediaObjectStore();
  let objectUrls: string[] = [];

  await db.transaction(async (tx) => {
    const [asset] = await tx
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.filename,
        storageUrl: mediaAssets.storageUrl,
        variants: mediaAssets.variants,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaId))
      .for("update");
    if (!asset) throw new UserInputError("That file is not in the library.");

    // Re-check inside the lock so a concurrent edit cannot race past the first check.
    const lockedRefs = await findMediaReferences(tx, mediaId);
    if (referencesBlockDeletion(lockedRefs)) {
      throw new UserInputError(mediaInUseMessage(lockedRefs));
    }

    objectUrls = [
      ...(asset.storageUrl ? [asset.storageUrl] : []),
      ...(asset.variants ?? []).map((variant) => variant.storageUrl),
    ];

    await tx.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
    await audit(tx, {
      actorId: actor.id,
      action: "media.deleted",
      entityType: "media",
      entityId: mediaId,
      details: {
        filename: asset.filename,
        objectUrls: objectUrls.length,
      },
    });
  });

  if (store && objectUrls.length > 0) {
    await store.deleteUrls(objectUrls);
  }
}

export type OrphanObjectReport = {
  orphanUrls: string[];
  orphanPathnames: string[];
  referencedUrls: string[];
};

/**
 * Report-only: lists object-store files under `media/` that are not referenced by any
 * `media_assets` row. Does not delete anything.
 */
export async function reportOrphanMediaObjects(db: Db): Promise<OrphanObjectReport> {
  const store = getMediaObjectStore();
  if (!store) {
    return { orphanUrls: [], orphanPathnames: [], referencedUrls: [] };
  }
  const rows = await db
    .select({
      storageUrl: mediaAssets.storageUrl,
      variants: mediaAssets.variants,
    })
    .from(mediaAssets);
  const referenced = new Set<string>();
  for (const row of rows) {
    if (row.storageUrl) referenced.add(row.storageUrl);
    for (const variant of row.variants ?? []) referenced.add(variant.storageUrl);
  }
  const listed = await store.listPathnames("media/");
  const orphanUrls: string[] = [];
  const orphanPathnames: string[] = [];
  for (const item of listed) {
    if (!referenced.has(item.url)) {
      orphanUrls.push(item.url);
      orphanPathnames.push(item.pathname);
    }
  }
  return {
    orphanUrls,
    orphanPathnames,
    referencedUrls: [...referenced],
  };
}
