export const CAPTION_MAX = 200;

export type ImageSize = { width: number; height: number };

/** Pixel sizes of library images, keyed by `mediaFileKey`. */
export type BodyImageSizes = Readonly<Record<string, ImageSize>>;

const MEDIA_FILE = /^\/media\/([0-9a-f-]{36})\/([^/#?]+)$/;

/** `id/filename` for a library file path, with the filename decoded so either spelling matches. */
export function mediaFileKey(path: string): string | null {
  const match = MEDIA_FILE.exec(path);
  if (!match?.[1] || !match[2]) return null;
  try {
    return `${match[1]}/${decodeURIComponent(match[2])}`;
  } catch {
    return null;
  }
}

const STANDALONE_LIBRARY_IMAGE = /^!\[[^\]\n]*\]\((\/media\/[^)\s]+)(?:\s+"[^"\n]*")?\)\s*$/;
const SECTION_HEADING = /^##\s+(.+?)\s*#*\s*$/;

function sectionKey(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Puts the library images of an earlier version back into rewritten Markdown. Each image goes
 * under the `##` heading it sat under before (images before the first heading go before it).
 * Images whose section no longer exists are added at the end. Images already present are skipped.
 */
export function carryOverImages(
  previous: string,
  next: string,
): { markdown: string; carried: number; atEnd: number } {
  const images: { section: string; line: string; src: string }[] = [];
  let section = "";
  for (const line of previous.split("\n")) {
    const heading = SECTION_HEADING.exec(line);
    if (heading?.[1]) section = sectionKey(heading[1]);
    const image = STANDALONE_LIBRARY_IMAGE.exec(line.trim());
    if (image?.[1]) images.push({ section, line: line.trim(), src: image[1] });
  }
  const missing = images.filter((image) => !next.includes(`(${image.src}`));
  if (missing.length === 0) return { markdown: next, carried: 0, atEnd: 0 };

  const lines = next.split("\n");
  const headingAt = new Map<string, number>();
  lines.forEach((line, index) => {
    const heading = SECTION_HEADING.exec(line);
    if (heading?.[1] && !headingAt.has(sectionKey(heading[1]))) headingAt.set(sectionKey(heading[1]), index);
  });
  const firstHeading = lines.findIndex((line) => SECTION_HEADING.test(line));

  const insertAfter = new Map<number, string[]>();
  const atEnd: string[] = [];
  for (const image of missing) {
    // -1 means "before the first heading"; images there go at the end of the introduction.
    const at = image.section
      ? headingAt.get(image.section)
      : firstHeading >= 0
        ? firstHeading - 1
        : undefined;
    if (at === undefined) atEnd.push(image.line);
    else insertAfter.set(at, [...(insertAfter.get(at) ?? []), image.line]);
  }

  const output: string[] = [];
  for (const image of insertAfter.get(-1) ?? []) output.push(image, "");
  lines.forEach((line, index) => {
    output.push(line);
    for (const image of insertAfter.get(index) ?? []) output.push("", image, "");
  });
  if (atEnd.length) output.push("", ...atEnd.flatMap((line) => [line, ""]));

  const markdown = output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { markdown, carried: missing.length, atEnd: atEnd.length };
}

/** Collapses whitespace so alt text and captions stay on one line inside the Markdown image syntax. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Markdown for one body image. The optional caption is stored as the image title
 * (`![alt](src "caption")`) and rendered as a figure caption on the article page.
 * Characters that would need escaping are replaced instead: the publish checks and the public
 * media check read image links with a simple pattern that does not understand escapes.
 */
export function imageMarkdown(image: { src: string; altText: string }, caption?: string): string {
  const alt = oneLine(image.altText.replaceAll("\\", "").replaceAll("[", "(").replaceAll("]", ")"));
  const title = oneLine((caption ?? "").replaceAll("\\", "").replaceAll('"', "'")).slice(0, CAPTION_MAX);
  return title ? `![${alt}](${image.src} "${title}")` : `![${alt}](${image.src})`;
}

/** Several images, each in its own paragraph so each renders as its own figure. */
export function imagesMarkdown(
  images: ReadonlyArray<{ src: string; altText: string; caption?: string }>,
): string {
  return images.map((image) => imageMarkdown(image, image.caption)).join("\n\n");
}

/**
 * Removes every image of library asset `mediaId` from the body. Plain links to the file keep their
 * text. Blank lines left behind are collapsed so the surrounding paragraphs stay separate.
 */
export function removeMediaFromBody(body: string, mediaId: string): string {
  const path = `/media/${mediaId.toLowerCase()}/`;
  const target = (url: string) => url.toLowerCase().startsWith(path);
  const without = body
    .replace(/!\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/g, (match, url: string) =>
      target(url) ? "" : match,
    )
    .replace(/\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/g, (match, text: string, url: string) =>
      target(url) ? text : match,
    );
  if (without === body) return body;
  return without
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * Removes one image's Markdown, found at `start`–`end` in the body (as reported by the preview).
 * A standalone image takes its blank-line gap with it; an inline one leaves the text joined by a
 * space. Returns the body unchanged if the range does not hold an image.
 */
export function removeImageAt(body: string, start: number, end: number): string {
  if (start < 0 || end > body.length || start >= end || !body.slice(start, end).startsWith("![")) return body;
  const before = body.slice(0, start).replace(/[ \t]+$/, "");
  const after = body.slice(end).replace(/^[ \t]+/, "");
  if (before === "" || before.endsWith("\n")) {
    const head = before.replace(/\n+$/, "");
    const tail = after.replace(/^\n+/, "");
    return head && tail ? `${head}\n\n${tail}` : head || tail;
  }
  return after === "" || after.startsWith("\n") ? `${before}${after}` : `${before} ${after}`;
}

/**
 * Replaces the address of the image whose Markdown is at `start`–`end`, keeping its alt text and
 * caption. Returns the body unchanged if the range does not hold an image.
 */
export function setImageSrcAt(body: string, start: number, end: number, src: string): string {
  if (start < 0 || end > body.length || start >= end) return body;
  const image = body.slice(start, end);
  const match = /^(!\[[^\]\n]*\]\()([^)\s]+)/.exec(image);
  if (!match?.[1] || !match[2]) return body;
  return `${body.slice(0, start)}${match[1]}${src}${image.slice(match[0].length)}${body.slice(end)}`;
}

/**
 * Inserts `snippet` in place of the selection. Block snippets (images) are separated from the
 * surrounding text by a blank line so they never end up inside a paragraph.
 */
export function insertSnippet(
  value: string,
  start: number,
  end: number,
  snippet: string,
  block = false,
): { value: string; cursor: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (!block) return { value: `${before}${snippet}${after}`, cursor: start + snippet.length };
  const lead = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const inserted = `${lead}${snippet}${trail}`;
  return { value: `${before}${inserted}${after}`, cursor: before.length + lead.length + snippet.length };
}
