import Link from "next/link";
import { categories, categoryPath } from "@/content/categories";
import { CategoryIcon } from "./category-icon";

export function CategoryGrid({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            href={categoryPath(category.slug)}
            className="group flex h-full flex-col rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) transition-[box-shadow,border-color,transform] duration-300 ease-(--ease-gentle) hover:-translate-y-0.5 hover:border-sage/40 hover:shadow-(--shadow-card-hover)"
          >
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-sage-pale text-sage-deep">
              <CategoryIcon slug={category.slug} className="size-5" />
            </span>
            <Heading className="mt-5 text-xl">{category.name}</Heading>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {category.covers.slice(0, 2).join(" · ")}
            </p>
            <span className="mt-auto pt-5 text-sm font-medium text-sage-deep">
              Explore
              <span
                aria-hidden="true"
                className="ml-1 inline-block transition-transform duration-300 group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
