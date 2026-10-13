import type { Heading } from "@/lib/content/markdown";

export function TableOfContents({ headings }: { headings: readonly Heading[] }) {
  const sections = headings.filter((heading) => heading.depth === 2);
  if (sections.length < 3) return null;
  return (
    <nav aria-labelledby="toc-heading" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="toc-heading" className="font-sans text-xs font-semibold tracking-[0.14em] text-muted uppercase">
        In this guide
      </h2>
      <ol className="mt-3 grid gap-2 text-sm">
        {sections.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className="text-ink/80 transition-colors hover:text-sage-deep">
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
