import type { Heading } from "@/lib/content/markdown";

function tocSections(headings: readonly Heading[]): Heading[] {
  return headings.filter((heading) => heading.depth === 2);
}

/** Short articles have no contents list, so the page can give the article the full width. */
export function hasTableOfContents(headings: readonly Heading[]): boolean {
  return tocSections(headings).length >= 3;
}

export function TableOfContents({ headings }: { headings: readonly Heading[] }) {
  if (!hasTableOfContents(headings)) return null;
  const sections = tocSections(headings);
  return (
    <nav aria-labelledby="toc-heading" className="border-l-2 border-oak-pale py-1 pl-5">
      <h2 id="toc-heading" className="font-sans text-xs font-semibold tracking-[0.14em] text-muted uppercase">
        In this guide
      </h2>
      <ol className="mt-3 grid gap-2 text-sm">
        {sections.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className="text-ink/80 transition-colors hover:text-oak-deep">
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
