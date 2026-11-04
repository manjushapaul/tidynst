import {
  assertWithinRateLimit,
  authenticateAutomation,
  automationCatalog,
  automationErrorResponse,
  automationJson,
} from "@/server/automation";
import { getDb } from "@/server/db";

/** The category, subcategory, topic and product names the guide endpoint accepts. */
export async function GET(request: Request) {
  try {
    const db = getDb();
    const actor = await authenticateAutomation(db, request.headers.get("authorization"));
    await assertWithinRateLimit(db, actor);
    return automationJson(200, await automationCatalog(db));
  } catch (error) {
    return automationErrorResponse(error);
  }
}
