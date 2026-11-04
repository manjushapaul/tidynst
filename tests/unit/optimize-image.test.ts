import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { optimiseImage, VARIANT_WIDTHS } from "@/lib/media/optimize-image";

async function source(width: number, height: number, withAlpha = false): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: withAlpha ? 4 : 3,
      background: withAlpha ? { r: 10, g: 20, b: 30, alpha: 0.5 } : { r: 10, g: 20, b: 30 },
    },
  });
  return withAlpha ? image.png().toBuffer() : image.jpeg().toBuffer();
}

describe("optimiseImage", () => {
  it("converts to WebP, preserves aspect ratio and does not upscale", async () => {
    const bytes = await source(80, 40);
    const result = await optimiseImage(bytes, { width: 80, height: 40 });
    expect(result.master.contentType).toBe("image/webp");
    expect(result.master.filename).toBe("image.webp");
    expect(result.master.width).toBe(80);
    expect(result.master.height).toBe(40);
    expect(result.variants).toHaveLength(0);
  });

  it("builds responsive variants only when the master is wider than each target", async () => {
    const bytes = await source(2000, 1000);
    const result = await optimiseImage(bytes, { width: 2000, height: 1000 });
    expect(result.master.width).toBeLessThanOrEqual(2000);
    expect(result.variants.map((v) => v.label)).toEqual(
      VARIANT_WIDTHS.filter((width) => result.master.width > width).map((width) => `w${width}`),
    );
    for (const variant of result.variants) {
      expect(variant.contentType).toBe("image/webp");
      expect(variant.width).toBeLessThan(result.master.width);
      expect(variant.bytes.byteLength).toBeGreaterThan(0);
    }
  });

  it("keeps transparency when encoding WebP from a PNG with alpha", async () => {
    const bytes = await source(32, 32, true);
    const result = await optimiseImage(bytes, { width: 32, height: 32 });
    const meta = await sharp(result.master.bytes).metadata();
    expect(meta.hasAlpha).toBe(true);
  });
});
