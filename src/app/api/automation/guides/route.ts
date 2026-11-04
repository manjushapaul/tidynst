import {
  AUTOMATION_BODY_MAX_BYTES,
  AutomationError,
  assertWithinRateLimit,
  authenticateAutomation,
  automationErrorResponse,
  automationJson,
  createGuideFromAutomation,
} from "@/server/automation";
import { getDb } from "@/server/db";

/** Creates an unpublished article draft. See docs/N8N-AUTOMATION.md for the request format. */
export async function POST(request: Request) {
  try {
    const db = getDb();
    const actor = await authenticateAutomation(db, request.headers.get("authorization"));
    await assertWithinRateLimit(db, actor);

    const text = await request.text();
    if (Buffer.byteLength(text) > AUTOMATION_BODY_MAX_BYTES) {
      throw new AutomationError(413, "The request body is too large.");
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new AutomationError(400, "The request body must be JSON.");
    }

    const created = await createGuideFromAutomation(db, actor, body);
    return automationJson(201, created);
  } catch (error) {
    return automationErrorResponse(error);
  }
}
