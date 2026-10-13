import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { mediaAssets } from "@/db/schema";
import { getDb } from "@/server/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  await connection();
  const { id, filename } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const [asset] = await getDb()
    .select({
      data: mediaAssets.data,
      contentType: mediaAssets.contentType,
      filename: mediaAssets.filename,
      sha256: mediaAssets.sha256,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  if (!asset || asset.filename !== decodeURIComponent(filename)) {
    return new Response("Not found", { status: 404 });
  }

  // Asset bytes never change for a given id, so they can be cached indefinitely.
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${asset.sha256}"`,
      "Content-Disposition": "inline",
    },
  });
}
