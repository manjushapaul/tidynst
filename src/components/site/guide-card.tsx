import Image from "next/image";
import Link from "next/link";
import { getCategory, guidePath } from "@/content/categories";
import { formatDate } from "@/lib/format";
import { loadPublicSite } from "@/server/loaders";
import type { GuideSummary } from "@/server/public-content";
import { CategoryIcon, CategoryIllustration, hasCategoryIllustration } from "./category-icon";

type GuideCardProps = {
  guide: GuideSummary;
  headingLevel?: "h2" | "h3";
  /** Mark the first above-the-fold card's image as high priority (LCP). */
  priority?: boolean;
};

export async function GuideCard({ guide, headingLevel = "h3", priority = false }: GuideCardProps) {
  const Heading = headingLevel;
  const home = await loadPublicSite();
  const category = guide.category ? home.categories.find((item) => item.slug === guide.category) : undefined;
  const fallback = guide.category ? getCategory(guide.category) : undefined;
  const label = category?.name ?? fallback?.name;
  const slug = category?.slug ?? fallback?.slug;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card) transition-[box-shadow,transform] duration-300 ease-(--ease-gentle) hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover)">
      <div className="relative aspect-[16/10] overflow-hidden bg-oak-pale">
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
          <div aria-hidden="true" className="flex h-full items-center justify-center text-oak/70">
            {slug && hasCategoryIllustration(slug) ? (
              <CategoryIllustration slug={slug} size={128} />
            ) : slug ? (
              <CategoryIcon slug={slug} className="size-14" />
            ) : null}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        {label ? <p className="eyebrow">{label}</p> : null}
        <Heading className="mt-2 text-xl leading-snug">
          <Link href={guidePath(guide)} className="after:absolute after:inset-0 focus-visible:outline-none">
            {guide.title}
          </Link>
        </Heading>
        <p className="mt-3 line-clamp-3 text-[calc(0.95rem*var(--text-scale))] leading-relaxed text-muted">{guide.excerpt}</p>
        <div className="mt-auto pt-5">
          {/* Visual cue only: the title link already covers the whole card. */}
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1 text-sm font-medium text-oak-deep transition-colors duration-200 ease-(--ease-gentle) group-hover:text-oak"
          >
            Read more <span>→</span>
          </span>
          <p className="mt-3 text-xs text-muted">
            <time dateTime={guide.updatedAt.toISOString()}>Updated {formatDate(guide.updatedAt)}</time>
            <span aria-hidden="true"> · </span>
            {guide.readingMinutes} min read
          </p>
        </div>
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
