/** The textarea's new value and selection after a formatting command. */
export type FormatEdit = { value: string; selectionStart: number; selectionEnd: number };

export type BlockFormat = "h2" | "h3" | "bullet" | "number" | "tip";

const TIP_LABEL = "**Tip:** ";

/** Any block prefix the toolbar can add, so switching format replaces it instead of stacking. */
const BLOCK_PREFIX = /^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?(?:\*\*Tip:\*\*\s*)?)/;

const PREFIX: Record<BlockFormat, (index: number) => string> = {
  h2: () => "## ",
  h3: () => "### ",
  bullet: () => "- ",
  number: (index) => `${index + 1}. `,
  tip: (index) => (index === 0 ? `> ${TIP_LABEL}` : "> "),
};

const HAS_FORMAT: Record<BlockFormat, RegExp> = {
  h2: /^##\s+/,
  h3: /^###\s+/,
  bullet: /^[-*+]\s+/,
  number: /^\d+[.)]\s+/,
  tip: /^>\s?/,
};

/**
 * Wraps the selection in an inline marker (bold `**`, italic `_`). With nothing selected, inserts
 * the markers around `placeholder` and selects it so typing replaces it. Selecting text that is
 * already wrapped removes the markers.
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  marker: string,
  placeholder: string,
): FormatEdit {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (selected && before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value: `${before.slice(0, -marker.length)}${selected}${after.slice(marker.length)}`,
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    };
  }
  const text = selected || placeholder;
  return {
    value: `${before}${marker}${text}${marker}${after}`,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + text.length,
  };
}

/**
 * Applies a block format (heading, list, tip) to every line the selection touches. Lines that
 * already have another block prefix are switched over; if every non-empty line already has this
 * format, it is removed instead. Numbered lists are renumbered from 1.
 */
export function formatLines(value: string, start: number, end: number, format: BlockFormat): FormatEdit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const content = lines.filter((line) => line.trim());
  const remove = content.length > 0 && content.every((line) => HAS_FORMAT[format].test(line));

  let index = 0;
  const next = lines.map((line) => {
    if (!line.trim()) return lines.length === 1 ? PREFIX[format](0) : line;
    const text = line.replace(BLOCK_PREFIX, "");
    if (remove) return text;
    return `${PREFIX[format](index++)}${text}`;
  });
  const replaced = next.join("\n");
  const result = `${value.slice(0, lineStart)}${replaced}${value.slice(lineEnd)}`;
  const collapsed = start === end;
  return {
    value: result,
    selectionStart: collapsed ? lineStart + replaced.length : lineStart,
    selectionEnd: lineStart + replaced.length,
  };
}

/**
 * Replaces the selection with a finished link. The link text is `text`, else the selection, else
 * `fallback` (such as the page's name). Square brackets are swapped for round ones so they cannot
 * end the link early. The cursor goes after the link.
 */
export function insertLinkTo(
  value: string,
  start: number,
  end: number,
  url: string,
  text: string,
  fallback: string,
): FormatEdit {
  const label = (text.trim() || value.slice(start, end).trim() || fallback.trim() || url)
    .replace(/\s+/g, " ")
    .replaceAll("[", "(")
    .replaceAll("]", ")");
  const inserted = `[${label}](${url})`;
  const cursor = start + inserted.length;
  return {
    value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

/** Inserts a link around the selection (or "link text") and selects the address to type over. */
export function insertLink(value: string, start: number, end: number): FormatEdit {
  const text = value.slice(start, end) || "link text";
  const url = "https://";
  const inserted = `[${text}](${url})`;
  const urlStart = start + text.length + 3;
  return {
    value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
}

/**
 * Enter inside a list item starts the next item (numbered lists count up). Enter on an empty item
 * ends the list. Returns null when the cursor is not in a list item, so Enter behaves normally.
 */
export function continueList(value: string, cursor: number): FormatEdit | null {
  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const line = value.slice(lineStart, cursor);
  const match = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  const [, indent = "", bullet = "-", number, text = ""] = match;
  if (!text.trim()) {
    const cleared = `${value.slice(0, lineStart)}${value.slice(cursor)}`;
    return { value: cleared, selectionStart: lineStart, selectionEnd: lineStart };
  }
  const marker = number ? `${Number(number) + 1}${bullet.slice(-1)}` : bullet;
  const insert = `\n${indent}${marker} `;
  return {
    value: `${value.slice(0, cursor)}${insert}${value.slice(cursor)}`,
    selectionStart: cursor + insert.length,
    selectionEnd: cursor + insert.length,
  };
}
