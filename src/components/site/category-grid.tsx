import Image from "next/image";
import Link from "next/link";
import { categoryPath } from "@/content/categories";
import type { PublicCategory } from "@/server/homepage";
import { CategoryIcon, CategoryIllustration, hasCategoryIllustration } from "./category-icon";

export function CategoryGrid({
  categories,
  headingLevel = "h3",
  linkLabel = "Explore",
}: {
  categories: readonly PublicCategory[];
  headingLevel?: "h2" | "h3";
  linkLabel?: string;
}) {
  const Heading = headingLevel;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            href={categoryPath(category.slug)}
            className="group flex h-full flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card) transition-[box-shadow,border-color,transform] duration-300 ease-(--ease-gentle) hover:-translate-y-1 hover:border-oak/35 hover:shadow-(--shadow-card-hover)"
          >
            <span className="relative flex aspect-[5/4] items-center justify-center bg-gradient-to-b from-sand/80 to-surface px-4 py-5">
              <span
                aria-hidden="true"
                className="absolute inset-x-6 bottom-3 h-2 rounded-full bg-oak/8 blur-[2px] transition-opacity duration-300 group-hover:opacity-70"
              />
              {category.image ? (
                <Image
                  src={category.image.src}
                  alt={category.image.alt}
                  width={category.image.width}
                  height={category.image.height}
                  className="relative max-h-32 w-auto object-contain drop-shadow-[0_10px_18px_rgb(106_78_51/0.18)] transition-transform duration-500 ease-(--ease-gentle) group-hover:-translate-y-1 group-hover:scale-[1.04]"
                />
              ) : hasCategoryIllustration(category.slug) ? (
                <CategoryIllustration
                  slug={category.slug}
                  size={128}
                  className="relative drop-shadow-[0_10px_18px_rgb(106_78_51/0.18)] transition-transform duration-500 ease-(--ease-gentle) group-hover:-translate-y-1 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="relative inline-flex size-16 items-center justify-center rounded-full bg-surface text-oak-deep shadow-(--shadow-card)">
                  <CategoryIcon slug={category.slug} className="size-8" />
                </span>
              )}
            </span>
            <span className="flex flex-1 flex-col px-5 pt-4 pb-5">
              <Heading className="text-xl leading-snug">{category.name}</Heading>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {category.covers.slice(0, 2).join(" · ")}
              </p>
              <span className="mt-auto pt-4 text-sm font-medium text-oak-deep">
                {linkLabel}
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
