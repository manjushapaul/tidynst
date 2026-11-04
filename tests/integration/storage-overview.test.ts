import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { storageOverview } from "@/server/admin/dashboard";
import { uploadMedia } from "@/server/media";
import { insertUser } from "../support/seed";
import { createTestDb } from "../support/test-db";

describe("storageOverview", () => {
  it("reports database size and image usage from an empty library", async () => {
    const { db, close } = await createTestDb();
    try {
      const storage = await storageOverview(db);
      expect(storage.databaseBytes).toBeGreaterThan(0);
      expect(storage.mediaBytes).toBe(0);
      expect(storage.mediaFiles).toBe(0);
      // PGlite's data directory is not a real host path this process can measure.
      expect(storage.disk).toBeNull();
    } finally {
      await close();
    }
  });

  it("adds uploaded image bytes to the image total", async () => {
    const { db, close } = await createTestDb();
    try {
      const editor = await insertUser(db, "editor");
      const bytes = await sharp({
        create: { width: 24, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .png()
        .toBuffer();
      const stored = await uploadMedia(db, editor, {
        bytes,
        declaredType: "image/png",
        altText: "A plain green square",
      });

      const storage = await storageOverview(db);
      expect(storage.mediaFiles).toBe(1);
      // Totals use the optimised master size, not the raw upload bytes.
      expect(storage.mediaBytes).toBe(stored.byteSize);
      expect(storage.mediaBytes).toBeGreaterThan(0);
      expect(storage.databaseBytes).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
