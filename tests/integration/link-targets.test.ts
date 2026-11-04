import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listLinkTargets } from "@/server/link-targets";
import { insertGuide, insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  const user = await insertUser(t.db, "editor");
  await insertGuide(
    t.db,
    user.id,
    { slug: "live-spice-guide", title: "Live spice guide" },
    { published: true },
  );
  await insertGuide(t.db, user.id, { slug: "draft-only-guide", title: "Draft only guide" });
});

afterAll(async () => {
  await t.close();
});

describe("link picker targets", () => {
  it("offers published articles, subcategories with their topics, and categories", async () => {
    const targets = await listLinkTargets(t.db, [{ slug: "kitchen", name: "Kitchen & Cooking" }]);

    expect(targets.articles).toEqual([
      expect.objectContaining({
        title: "Live spice guide",
        path: "/categories/kitchen/live-spice-guide",
        categoryName: "Kitchen & Cooking",
      }),
    ]);
    expect(targets.categories[0]).toEqual({ name: "Kitchen & Cooking", path: "/categories/kitchen" });

    const kitchen = targets.subcategories.filter((group) => group.categoryName === "Kitchen & Cooking");
    expect(kitchen.length).toBeGreaterThan(0);
    for (const group of targets.subcategories) {
      expect(group.path).toMatch(/^\/categories\/[a-z-]+\/[a-z0-9-]+$/);
      for (const topic of group.topics) {
        expect(topic.path).toMatch(/^\/categories\/[a-z-]+\/[a-z0-9-]+$/);
        expect(topic.path).not.toBe(group.path);
      }
    }
    expect(targets.subcategories.map((group) => group.categoryName)[0]).toBe("Kitchen & Cooking");
  });
});
