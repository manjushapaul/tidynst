import { type NextRequest, NextResponse } from "next/server";
import { optimizerSource } from "@/lib/media/media-url";
import { getDb } from "@/server/db";
import { isPublishedMedia } from "@/server/media-access";

/**
 * The image optimizer keeps serving a cached image even after its source starts returning 404, so
 * library images are checked here, before that cache, on every optimizer request.
 */
export async function proxy(request: NextRequest) {
  const source = optimizerSource(request.nextUrl.searchParams.get("url"));
  if (source.kind === "other") return NextResponse.next();
  if (source.kind === "media" && (await isPublishedMedia(getDb(), source.id))) return NextResponse.next();
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export const config = {
  matcher: "/_next/image",
};
