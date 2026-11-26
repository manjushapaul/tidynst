import { subcategoryPath, type CategorySlug } from "@/content/categories";
import type { PublicSubcategoryGroup } from "@/server/subcategories";
import Link from "next/link";

const CARD_TINTS = [
  "bg-oak-pale hover:bg-[#ead8bc] focus-visible:bg-[#ead8bc]",
  "bg-sand hover:bg-[#e8e0d1] focus-visible:bg-[#e8e0d1]",
  "bg-[#edf1e8] hover:bg-[#dfe8d9] focus-visible:bg-[#dfe8d9]",
  "bg-[#eef1f5] hover:bg-[#e0e6ee] focus-visible:bg-[#e0e6ee]",
  "bg-[#f6ebe5] hover:bg-[#eedbd1] focus-visible:bg-[#eedbd1]",
] as const;

/** The clickable subcategories under a main category. */
export function SubcategoryGroups({
  category,
  groups,
}: {
  category: CategorySlug;
  groups: readonly PublicSubcategoryGroup[];
}) {
  return (
    <section className="mt-8 px-4 sm:px-5" aria-label="Browse subcategories">
      <h2 className="text-base font-semibold tracking-tight text-ink">Explore by area</h2>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Subcategories">
        {groups.map((group, index) => (
          <li key={group.id}>
            <Link
              href={subcategoryPath(category, group.slug)}
              className={`group flex min-h-[76px] items-center gap-3 rounded-xl px-3 shadow-(--shadow-card) transition-[background-color,box-shadow,transform] duration-300 ease-(--ease-gentle) hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oak ${CARD_TINTS[index % CARD_TINTS.length]}`}
            >
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                {group.iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.iconSrc} alt="" className="size-[45px] object-contain" />
                ) : (
                  <span aria-hidden="true" className="font-serif text-xl text-oak-deep">
                    {group.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="min-w-0 text-sm font-medium leading-snug text-ink group-hover:text-oak-deep">
                {group.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
