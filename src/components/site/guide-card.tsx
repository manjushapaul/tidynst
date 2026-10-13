import Image from "next/image";
import Link from "next/link";
import { getCategory } from "@/content/categories";
import { formatDate } from "@/lib/format";
import type { GuideSummary } from "@/server/public-content";
import { CategoryIcon } from "./category-icon";

type GuideCardProps = {
  guide: GuideSummary;
  headingLevel?: "h2" | "h3";
  /** Mark the first above-the-fold card's image as high priority (LCP). */
  priority?: boolean;
};

export function GuideCard({ guide, headingLevel = "h3", priority = false }: GuideCardProps) {
  const Heading = headingLevel;
  const category = guide.category ? getCategory(guide.category) : undefined;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card) transition-[box-shadow,transform] duration-300 ease-(--ease-gentle) hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover)">
      <div className="relative aspect-[16/10] overflow-hidden bg-sage-pale">
        {guide.image ? (
          <Image
            src={guide.image.src}
            alt={guide.image.alt}
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 ease-(--ease-gentle) group-hover:scale-[1.03]"
            priority={priority}
          />
        ) : (
          <div aria-hidden="true" className="flex h-full items-center justify-center text-sage/70">
            {category ? <CategoryIcon slug={category.slug} className="size-14" /> : null}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        {category ? <p className="eyebrow">{category.name}</p> : null}
        <Heading className="mt-2 text-xl leading-snug">
          <Link
            href={`/guides/${guide.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {guide.title}
          </Link>
        </Heading>
        <p className="mt-3 line-clamp-3 text-[0.95rem] leading-relaxed text-muted">{guide.excerpt}</p>
        <p className="mt-auto pt-5 text-xs text-muted">
          <time dateTime={guide.updatedAt.toISOString()}>Updated {formatDate(guide.updatedAt)}</time>
          <span aria-hidden="true"> · </span>
          {guide.readingMinutes} min read
        </p>
      </div>
    </article>
  );
}

export function GuideGrid({
  guides,
  headingLevel,
  priorityFirst = false,
}: {
  guides: readonly GuideSummary[];
  headingLevel?: "h2" | "h3";
  priorityFirst?: boolean;
}) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {guides.map((guide, index) => (
        <li key={guide.slug}>
          <GuideCard guide={guide} headingLevel={headingLevel} priority={priorityFirst && index === 0} />
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-(--radius-card) border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <p className="font-serif text-xl">{title}</p>
      <div className="mx-auto mt-3 max-w-md text-muted">{children}</div>
    </div>
  );
}
