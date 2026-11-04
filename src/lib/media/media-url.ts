const MEDIA_PATH = /^\/media\/([^/]+)\/[^/]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "http://media.invalid";

/**
 * Classifies the `url` parameter of an image-optimizer request. Paths are normalised (dot segments,
 * percent-encoding) the way the router would resolve them, so an encoded variant of a library path
 * is still recognised as library media.
 */
export function optimizerSource(
  raw: string | null,
): { kind: "media"; id: string } | { kind: "invalid-media" } | { kind: "other" } {
  if (!raw) return { kind: "other" };
  let pathname: string;
  try {
    const first = new URL(raw, BASE);
    if (first.origin !== BASE) return { kind: "other" };
    pathname = new URL(decodeURIComponent(first.pathname), BASE).pathname;
  } catch {
    return raw.toLowerCase().includes("media") ? { kind: "invalid-media" } : { kind: "other" };
  }
  if (!pathname.startsWith("/media/")) return { kind: "other" };
  const id = MEDIA_PATH.exec(pathname)?.[1];
  return id && UUID.test(id) ? { kind: "media", id: id.toLowerCase() } : { kind: "invalid-media" };
}
