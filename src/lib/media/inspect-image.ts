import { createHash } from "node:crypto";

/**
 * Uploads are decoded with sharp (shipped with Next.js) so width and height come from the bitmap.
 * If sharp cannot be loaded, the upload is rejected instead of stored unverified.
 */

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
/** Multipart fields (alt text, CSRF token, filename) sit beside the file. */
export const MEDIA_MAX_REQUEST_BYTES = MEDIA_MAX_BYTES + 64 * 1024;
export const MEDIA_MAX_EDGE = 10_000;
/** Caps decoded bitmaps well below the database's per-edge limit to reject decompression bombs. */
export const MEDIA_MAX_PIXELS = 24_000_000;

export const MEDIA_TYPES = {
  jpeg: { contentType: "image/jpeg", filename: "image.jpg" },
  png: { contentType: "image/png", filename: "image.png" },
  webp: { contentType: "image/webp", filename: "image.webp" },
  avif: { contentType: "image/avif", filename: "image.avif" },
} as const;

export type MediaFormat = keyof typeof MEDIA_TYPES;
export type MediaContentType = (typeof MEDIA_TYPES)[MediaFormat]["contentType"];

export class ImageRejectError extends Error {
  override name = "ImageRejectError";
}

export type InspectedImage = {
  contentType: MediaContentType;
  filename: string;
  width: number;
  height: number;
  sha256: string;
  bytes: Buffer;
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[start + i] ?? 0);
  return out;
}

export function detectImageFormat(bytes: Uint8Array): MediaFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (isAvif(bytes)) return "avif";
  return null;
}

function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return false;
  const boxSize = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
  const end = Math.min(bytes.length, boxSize > 16 ? boxSize : 32);
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    const brand = ascii(bytes, offset, 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
}

export function normaliseDeclaredType(raw: string): string {
  const value = raw.toLowerCase().split(";")[0]?.trim() ?? "";
  return value === "image/jpg" ? "image/jpeg" : value;
}

function formatMatches(format: MediaFormat, meta: { format?: string; compression?: string }): boolean {
  if (format === "avif") return meta.format === "heif" && meta.compression === "av1";
  if (format === "jpeg") return meta.format === "jpeg";
  return meta.format === format;
}

function friendlyDecodeError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("pixel") || message.includes("exceed") || message.includes("limit")) {
    return "That image is too large to process. Use a smaller width and height.";
  }
  return "That image could not be read. It may be damaged, truncated, or the wrong format.";
}

/**
 * Rejects a request before the body is parsed. Missing length is refused so a client cannot
 * stream an unbounded payload.
 */
export function uploadLengthProblem(
  contentLength: string | null,
): "missing" | "invalid" | "too_large" | null {
  if (contentLength === null || contentLength.trim() === "") return "missing";
  if (!/^\d+$/.test(contentLength)) return "invalid";
  const length = Number(contentLength);
  if (!Number.isSafeInteger(length)) return "invalid";
  if (length > MEDIA_MAX_REQUEST_BYTES) return "too_large";
  return null;
}

export async function inspectImage(input: Uint8Array): Promise<InspectedImage> {
  if (input.byteLength === 0) throw new ImageRejectError("The file is empty.");
  if (input.byteLength > MEDIA_MAX_BYTES) {
    throw new ImageRejectError("Images must be 5 MB or smaller.");
  }
  const format = detectImageFormat(input);
  if (!format) throw new ImageRejectError("Use a JPEG, PNG, WebP or AVIF image.");

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw new ImageRejectError("Image processing is unavailable. Try again later.");
  }

  const buffer = Buffer.from(input);
  const options = {
    limitInputPixels: MEDIA_MAX_PIXELS,
    failOn: "error" as const,
    animated: false,
    sequentialRead: true,
  };
  let meta: { format?: string; width?: number; height?: number; compression?: string; pages?: number };
  try {
    meta = await sharp(buffer, options).metadata();
  } catch (error) {
    throw new ImageRejectError(friendlyDecodeError(error));
  }
  if (!formatMatches(format, meta)) {
    throw new ImageRejectError("The file contents do not match an allowed image type.");
  }
  if ((meta.pages ?? 1) > 1) throw new ImageRejectError("Animated images are not supported.");
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (
    width < 1 ||
    height < 1 ||
    width > MEDIA_MAX_EDGE ||
    height > MEDIA_MAX_EDGE ||
    width * height > MEDIA_MAX_PIXELS
  ) {
    throw new ImageRejectError("That image is too large to process. Use a smaller width and height.");
  }

  let decoded: { info: { width: number; height: number; channels: number } };
  try {
    decoded = await sharp(buffer, options).raw().toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new ImageRejectError(friendlyDecodeError(error));
  }
  if (decoded.info.width !== width || decoded.info.height !== height) {
    throw new ImageRejectError(
      "That image could not be read. It may be damaged, truncated, or the wrong format.",
    );
  }

  const spec = MEDIA_TYPES[format];
  return {
    contentType: spec.contentType,
    filename: spec.filename,
    width,
    height,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    bytes: buffer,
  };
}
