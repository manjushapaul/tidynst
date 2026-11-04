import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/permissions";
import { pageViewReport, recordPageView } from "@/server/analytics/page-views";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
const db = () => t.db;
let owner: Actor;
let author: Actor;
const now = new Date("2026-10-20T06:30:00.000Z");
const older = new Date("2026-09-01T06:30:00.000Z");

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  author = asActor(await insertUser(t.db, "author"));
});

afterAll(async () => {
  await t.close();
});

describe("page view totals", () => {
  it("adds repeat opens of the same page and keeps older days", async () => {
    const article = "/categories/kitchen/small-kitchen-organization-ideas";
    expect(await recordPageView(db(), "/", now)).toBe(true);
    expect(await recordPageView(db(), "/", now)).toBe(true);
    expect(await recordPageView(db(), article, now)).toBe(true);
    expect(await recordPageView(db(), "/", older)).toBe(true);
    expect(await recordPageView(db(), "/admin/traffic", now)).toBe(false);
    expect(await recordPageView(db(), "/search?q=masala", now)).toBe(false);

    const report = await pageViewReport(db(), owner, now);
    expect(report).toMatchObject({ today: 3, last7Days: 3, last30Days: 3, allTime: 4 });
    expect(report?.pages.map((page) => page.path)).toEqual(["/", article]);
    expect(report?.pages[0]).toMatchObject({ path: "/", views30: 2, viewsAll: 3, lastDay: "2026-10-20" });
    expect(report?.pages[1]).toMatchObject({ views30: 1, viewsAll: 1 });
  });

  it("hides the report from authors", async () => {
    expect(await pageViewReport(db(), author, now)).toBeNull();
  });
});
