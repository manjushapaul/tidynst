import { isAutomatedClient, normalisePagePath } from "@/lib/analytics/page-path";
import { ActionSecurityError, assertSameOrigin, requestMeta } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { recordPageView } from "@/server/analytics/page-views";

export const dynamic = "force-dynamic";

const MAX_BODY = 512;

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/**
 * Counts one public page open. The body is only a path. Same-origin browsers can call it; the
 * stored row is a daily total, never a visitor.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await assertSameOrigin();
  } catch (error) {
    const message = error instanceof ActionSecurityError ? error.message : "Cross-origin request rejected.";
    return Response.json({ ok: false, message }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const { userAgent } = await requestMeta();
  if (isAutomatedClient(userAgent)) return noContent();

  let path = "";
  try {
    const text = await request.text();
    if (text.length === 0 || text.length > MAX_BODY) return noContent();
    const body = JSON.parse(text) as { path?: unknown };
    path = typeof body.path === "string" ? body.path : "";
  } catch {
    return noContent();
  }
  if (!normalisePagePath(path)) return noContent();

  try {
    await recordPageView(getDb(), path);
  } catch (error) {
    console.error("Page view was not recorded:", error instanceof Error ? error.message : error);
  }
  return noContent();
}
