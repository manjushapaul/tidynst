import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { mediaAssets } from "@/db/schema";
import { can } from "@/server/auth/permissions";
import { getSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { isPublishedMedia, PUBLIC_MEDIA_MAX_AGE } from "@/server/media-access";
import { getMediaObjectStore } from "@/server/media/object-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Published images may sit in browser and shared caches for a few minutes after unpublishing;
 * they are revalidated rather than cached as immutable so that window stays short.
 */
const PUBLIC_CACHE = `public, max-age=${PUBLIC_MEDIA_MAX_AGE}, must-revalidate`;
const STAFF_CACHE = "private, no-cache";

function notFound(): Response {
  // Unpublished and missing assets look the same, and a 404 is never cached in case it is published later.
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  await connection();
  const { id, filename } = await params;
  if (!UUID.test(id)) return notFound();

  const db = getDb();
  const published = await isPublishedMedia(db, id);
  if (!published) {
    const session = await getSession();
    if (!session || !can(session.user, "media.upload")) return notFound();
  }

  const [asset] = await db
    .select({
      data: mediaAssets.data,
      contentType: mediaAssets.contentType,
      filename: mediaAssets.filename,
      sha256: mediaAssets.sha256,
      storageUrl: mediaAssets.storageUrl,
      variants: mediaAssets.variants,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  let requestedName: string;
  try {
    requestedName = decodeURIComponent(filename);
  } catch {
    return notFound();
  }
  if (!asset) return notFound();

  const variant = (asset.variants ?? []).find((row) => row.filename === requestedName);
  const isMaster = asset.filename === requestedName;
  if (!isMaster && !variant) return notFound();

  const etag = `"${asset.sha256}${variant ? `:${variant.label}` : ""}"`;
  const headers = {
    "Cache-Control": published ? PUBLIC_CACHE : STAFF_CACHE,
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  let body: Buffer;
  let contentType: string;

  if (variant) {
    const store = getMediaObjectStore();
    if (!store) return notFound();
    const object = await store.getByUrl(variant.storageUrl);
    if (!object) return notFound();
    body = object.body;
    contentType = variant.contentType;
  } else if (asset.storageUrl) {
    const store = getMediaObjectStore();
    if (!store) return notFound();
    const object = await store.getByUrl(asset.storageUrl);
    if (!object) return notFound();
    body = object.body;
    contentType = asset.contentType;
  } else if (asset.data) {
    body = Buffer.isBuffer(asset.data) ? asset.data : Buffer.from(asset.data);
    contentType = asset.contentType;
  } else {
    return notFound();
  }

  return new Response(new Uint8Array(body), {
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": "inline",
    },
  });
}
