import {
  ImageRejectError,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_EDGE,
  MEDIA_MAX_PIXELS,
  type MediaContentType,
} from "@/lib/media/inspect-image";

/** Longest edge for the stored master; larger uploads are downscaled, never upscaled. */
export const MASTER_MAX_EDGE = 2560;

/** Extra widths generated only when the master is wider than the target. */
export const VARIANT_WIDTHS = [640, 1280, 1920] as const;

export type OptimisedVariant = {
  label: string;
  width: number;
  height: number;
  contentType: MediaContentType;
  filename: string;
  bytes: Buffer;
};

export type OptimisedImage = {
  master: OptimisedVariant;
  variants: OptimisedVariant[];
};

function friendlyEncodeError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("pixel") || message.includes("exceed") || message.includes("limit")) {
    return "That image is too large to process. Use a smaller width and height.";
  }
  return "That image could not be processed. Try a different JPEG, PNG, WebP or AVIF file.";
}

/**
 * Resizes (without upscaling), compresses and converts to WebP where appropriate.
 * Transparent sources stay as WebP with alpha. Animated inputs are rejected upstream by inspect.
 */
export async function optimiseImage(
  input: Buffer,
  source: { width: number; height: number },
): Promise<OptimisedImage> {
  const { default: sharp } = await import("sharp").catch(() => {
    throw new ImageRejectError("Image processing is unavailable. Try again later.");
  });

  const options = {
    limitInputPixels: MEDIA_MAX_PIXELS,
    failOn: "error" as const,
    animated: false,
    sequentialRead: true,
  };

  const masterEdge = Math.min(MASTER_MAX_EDGE, MEDIA_MAX_EDGE);
  const scale = Math.min(1, masterEdge / Math.max(source.width, source.height));
  const masterWidth = Math.max(1, Math.round(source.width * scale));
  const masterHeight = Math.max(1, Math.round(source.height * scale));

  async function encodeWebp(width: number, height: number, label: string): Promise<OptimisedVariant> {
    try {
      const pipeline = sharp(input, options).rotate().resize({
        width,
        height,
        fit: "inside",
        withoutEnlargement: true,
      });
      const bytes = await pipeline.webp({ quality: 82, effort: 4, alphaQuality: 90 }).toBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_MAX_BYTES) {
        throw new ImageRejectError("The processed image is too large to store. Use a smaller file.");
      }
      const meta = await sharp(bytes, options).metadata();
      const outWidth = meta.width ?? width;
      const outHeight = meta.height ?? height;
      const filename = label === "master" ? "image.webp" : `image-${label}.webp`;
      return {
        label,
        width: outWidth,
        height: outHeight,
        contentType: "image/webp",
        filename,
        bytes,
      };
    } catch (error) {
      if (error instanceof ImageRejectError) throw error;
      throw new ImageRejectError(friendlyEncodeError(error));
    }
  }

  const master = await encodeWebp(masterWidth, masterHeight, "master");
  const variants: OptimisedVariant[] = [];
  for (const target of VARIANT_WIDTHS) {
    if (master.width <= target) continue;
    const ratio = target / master.width;
    const height = Math.max(1, Math.round(master.height * ratio));
    variants.push(await encodeWebp(target, height, `w${target}`));
  }

  return { master, variants };
}
