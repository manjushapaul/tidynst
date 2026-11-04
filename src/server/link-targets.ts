import "server-only";
import { asc, eq, isNotNull } from "drizzle-orm";
import { guideRevisions, guides, subcategories, subcategoryGroups } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  CATEGORY_SLUGS,
  categoryPath,
  guidePath,
  subcategoryPath,
  type CategorySlug,
} from "@/content/categories";
import type { LinkTargets } from "@/lib/content/link-targets";

/** Everything the editor's link picker offers, using the names shown on the public site. */
export async function listLinkTargets(
  db: Db,
  categories: ReadonlyArray<{ slug: CategorySlug; name: string }>,
): Promise<LinkTargets> {
  const nameOf = (slug: CategorySlug | null) =>
    slug ? (categories.find((category) => category.slug === slug)?.name ?? slug) : null;

  const [groupRows, topicRows, articleRows] = await Promise.all([
    db
      .select({
        id: subcategoryGroups.id,
        category: subcategoryGroups.category,
        slug: subcategoryGroups.slug,
        name: subcategoryGroups.name,
      })
      .from(subcategoryGroups)
      .orderBy(asc(subcategoryGroups.position), asc(subcategoryGroups.name)),
    db
      .select({
        groupId: subcategories.groupId,
        category: subcategories.category,
        slug: subcategories.slug,
        name: subcategories.name,
      })
      .from(subcategories)
      .orderBy(asc(subcategories.position), asc(subcategories.name)),
    db
      .select({
        id: guides.id,
        slug: guideRevisions.slug,
        title: guideRevisions.title,
        category: guideRevisions.category,
      })
      .from(guides)
      .innerJoin(guideRevisions, eq(guides.publishedRevisionId, guideRevisions.id))
      .where(isNotNull(guides.publishedRevisionId))
      .orderBy(asc(guideRevisions.title)),
  ]);

  const order = (slug: CategorySlug) => CATEGORY_SLUGS.indexOf(slug);
  return {
    categories: CATEGORY_SLUGS.map((slug) => ({ name: nameOf(slug)!, path: categoryPath(slug) })),
    subcategories: [...groupRows]
      .sort((a, b) => order(a.category) - order(b.category))
      .map((group) => ({
        categoryName: nameOf(group.category)!,
        name: group.name,
        path: subcategoryPath(group.category, group.slug),
        topics: topicRows
          .filter((topic) => topic.groupId === group.id && topic.slug !== group.slug)
          .map((topic) => ({ name: topic.name, path: subcategoryPath(topic.category, topic.slug) })),
      })),
    articles: articleRows.map((row) => ({
      id: row.id,
      title: row.title,
      path: guidePath(row),
      categoryName: nameOf(row.category),
    })),
  };
}
