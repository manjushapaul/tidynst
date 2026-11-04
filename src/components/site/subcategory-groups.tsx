import { subcategoryPath, type CategorySlug } from "@/content/categories";
import type { PublicSubcategoryGroup } from "@/server/subcategories";
import { ButtonLink } from "@/components/ui/button";

/** The clickable subcategories under a main category. */
export function SubcategoryGroups({
  category,
  groups,
}: {
  category: CategorySlug;
  groups: readonly PublicSubcategoryGroup[];
}) {
  return (
    <ul className="mt-8 flex flex-wrap gap-2.5" aria-label="Subcategories">
      {groups.map((group) => (
        <li key={group.id}>
          <ButtonLink href={subcategoryPath(category, group.slug)} variant="secondary" size="sm">
            {group.name}
          </ButtonLink>
        </li>
      ))}
    </ul>
  );
}
