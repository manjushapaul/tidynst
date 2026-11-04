import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";
import {
  ImageRejectError,
  detectImageFormat,
  inspectImage,
  MEDIA_MAX_BYTES,
} from "@/lib/media/inspect-image";

async function tiny(format: "png" | "jpeg" | "webp" | "avif"): Promise<Buffer> {
  const image = sharp({
    create: { width: 8, height: 6, channels: 3, background: { r: 20, g: 40, b: 60 } },
  });
  if (format === "png") return image.png().toBuffer();
  if (format === "jpeg") return image.jpeg().toBuffer();
  if (format === "webp") return image.webp().toBuffer();
  return image.avif().toBuffer();
}

function pngHeader(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const body = Buffer.concat([Buffer.from("IHDR"), ihdr]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(ihdr.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([signature, length, body, crc]);
}

describe("inspectImage", () => {
  it("accepts JPEG, PNG, WebP and AVIF and reads real dimensions", async () => {
    for (const format of ["png", "jpeg", "webp", "avif"] as const) {
      const bytes = await tiny(format);
      const inspected = await inspectImage(bytes);
      expect(inspected.width).toBe(8);
      expect(inspected.height).toBe(6);
      expect(inspected.sha256).toHaveLength(64);
    }
  });

  it("rejects a spoofed signature, malformed bytes, and unsupported files", async () => {
    const png = await tiny("png");
    expect(detectImageFormat(png)).toBe("png");
    const jpeg = await tiny("jpeg");
    expect(detectImageFormat(jpeg)).not.toBe("png");
    await expect(inspectImage(Buffer.from("GIF89a not really"))).rejects.toBeInstanceOf(ImageRejectError);
    await expect(
      inspectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])),
    ).rejects.toBeInstanceOf(ImageRejectError);
  });

  it("rejects oversized files and unreasonable dimensions", async () => {
    await expect(inspectImage(Buffer.alloc(MEDIA_MAX_BYTES + 1, 0xff))).rejects.toThrow(/5 MB/);
    await expect(inspectImage(pngHeader(20_000, 20_000))).rejects.toBeInstanceOf(ImageRejectError);
  });
});
