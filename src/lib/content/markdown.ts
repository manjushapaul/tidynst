import GithubSlugger from "github-slugger";

export type Heading = { depth: number; text: string; id: string };

const FENCE = /^(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/** Lines of Markdown outside fenced code blocks. */
function proseLines(markdown: string): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) lines.push(line);
  }
  return lines;
}

/** Plain text of inline Markdown: strips emphasis, code, links and images. */
export function inlineText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** ATX headings with the same ids rehype-slug generates, for a table of contents. */
export function extractHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  for (const line of proseLines(markdown)) {
    const match = HEADING.exec(line);
    if (!match?.[1] || !match[2]) continue;
    const text = inlineText(match[2]);
    headings.push({ depth: match[1].length, text, id: slugger.slug(text) });
  }
  return headings;
}

export function countWords(markdown: string): number {
  const text = proseLines(markdown)
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(countWords(markdown) / 220));
}

export type MarkdownLink = { text: string; url: string; image: boolean };

export function extractLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const pattern = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const line of proseLines(markdown)) {
    for (const match of line.matchAll(pattern)) {
      links.push({ image: match[1] === "!", text: match[2] ?? "", url: match[3] ?? "" });
    }
  }
  return links;
}
