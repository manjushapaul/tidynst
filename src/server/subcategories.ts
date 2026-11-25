import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { guideRevisions, guides, mediaAssets, subcategoryGroups, subcategories } from "@/db/schema";
import type { Db } from "@/db/types";
import { subcategoryPath, type CategorySlug } from "@/content/categories";
import { mediaPath } from "@/server/public-content";
import {
  SUBCATEGORY_LIMITS,
  createGroupSchema,
  groupFieldsSchema,
  subcategoryFieldErrors,
  subcategoryNameSchema,
} from "@/lib/content/subcategory-schema";
import { isValidSlug, slugify } from "@/lib/content/slug";
import { audit } from "@/server/audit";
import { can, type Actor, AuthorizationError } from "@/server/auth/permissions";
import { isUniqueViolation } from "@/server/pg-error";
import { UserInputError } from "@/server/users";

export class SubcategoryFormError extends Error {
  override name = "SubcategoryFormError";
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export type PublicSubcategoryGroup = {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconSrc: string | null;
  subcategories: { id: string; slug: string; name: string }[];
};

export type PublicGroup = {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconSrc: string | null;
  category: CategorySlug;
};

export type PublicSubcategory = {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  groupId: string;
  groupSlug: string;
  groupName: string;
  groupDescription: string;
};

export type AdminSubcategoryGroup = PublicSubcategoryGroup & { category: CategorySlug; iconMediaId: string | null };

function assertManager(actor: Actor) {
  if (!can(actor, "site.manage")) throw new AuthorizationError();
}

function idOf(value: string, what: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new UserInputError(`${what} not found.`);
  return parsed.data;
}

async function nextGroupPosition(tx: Db, category: CategorySlug): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`coalesce(max(${subcategoryGroups.position}), -1)::int` })
    .from(subcategoryGroups)
    .where(eq(subcategoryGroups.category, category));
  return (row?.n ?? -1) + 1;
}

async function nextSubcategoryPosition(tx: Db, groupId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`coalesce(max(${subcategories.position}), -1)::int` })
    .from(subcategories)
    .where(eq(subcategories.groupId, groupId));
  return (row?.n ?? -1) + 1;
}

/** True when any article address, including an old revision, already uses this slug. */
export async function articleUsesSlug(db: Db, slug: string): Promise<boolean> {
  const [guide] = await db.select({ id: guides.id }).from(guides).where(eq(guides.slug, slug)).limit(1);
  if (guide) return true;
  const [revision] = await db
    .select({ id: guideRevisions.id })
    .from(guideRevisions)
    .where(eq(guideRevisions.slug, slug))
    .limit(1);
  return Boolean(revision);
}

async function categorySlugTaken(db: Db, category: CategorySlug, slug: string): Promise<boolean> {
  const [group] = await db
    .select({ id: subcategoryGroups.id })
    .from(subcategoryGroups)
    .where(and(eq(subcategoryGroups.category, category), eq(subcategoryGroups.slug, slug)))
    .limit(1);
  if (group) return true;
  const [item] = await db
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(and(eq(subcategories.category, category), eq(subcategories.slug, slug)))
    .limit(1);
  return Boolean(item);
}

export async function subcategoryUsesSlug(db: Db, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(eq(subcategories.slug, slug))
    .limit(1);
  return Boolean(row);
}

export async function listPublicGroups(db: Db, category: CategorySlug): Promise<PublicSubcategoryGroup[]> {
  const groups = await db
    .select({
      id: subcategoryGroups.id,
      slug: subcategoryGroups.slug,
      name: subcategoryGroups.name,
      description: subcategoryGroups.description,
      iconMediaId: subcategoryGroups.iconMediaId,
      iconFilename: mediaAssets.filename,
    })
    .from(subcategoryGroups)
    .leftJoin(mediaAssets, eq(subcategoryGroups.iconMediaId, mediaAssets.id))
    .where(eq(subcategoryGroups.category, category))
    .orderBy(asc(subcategoryGroups.position), asc(subcategoryGroups.name));
  if (groups.length === 0) return [];
  const items = await db
    .select({
      id: subcategories.id,
      groupId: subcategories.groupId,
      slug: subcategories.slug,
      name: subcategories.name,
    })
    .from(subcategories)
    .where(eq(subcategories.category, category))
    .orderBy(asc(subcategories.position), asc(subcategories.name));
  return groups.map((group) => ({
    id: group.id,
    slug: group.slug,
    name: group.name,
    description: group.description,
    iconSrc: group.iconMediaId && group.iconFilename ? mediaPath(group.iconMediaId, group.iconFilename) : null,
    subcategories: items
      .filter((item) => item.groupId === group.id)
      .map(({ id, slug, name }) => ({ id, slug, name })),
  }));
}

export async function getPublicSubcategory(
  db: Db,
  category: CategorySlug,
  slug: string,
): Promise<PublicSubcategory | null> {
  const [row] = await db
    .select({
      id: subcategories.id,
      slug: subcategories.slug,
      name: subcategories.name,
      category: subcategories.category,
      groupId: subcategoryGroups.id,
      groupSlug: subcategoryGroups.slug,
      groupName: subcategoryGroups.name,
      groupDescription: subcategoryGroups.description,
    })
    .from(subcategories)
    .innerJoin(subcategoryGroups, eq(subcategories.groupId, subcategoryGroups.id))
    .where(and(eq(subcategories.category, category), eq(subcategories.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** The subcategory shown on a category page. Its articles are the guides filed under it. */
export async function getPublicGroup(
  db: Db,
  category: CategorySlug,
  slug: string,
): Promise<PublicGroup | null> {
  const [row] = await db
    .select({
      id: subcategoryGroups.id,
      slug: subcategoryGroups.slug,
      name: subcategoryGroups.name,
      description: subcategoryGroups.description,
      iconMediaId: subcategoryGroups.iconMediaId,
      iconFilename: mediaAssets.filename,
      category: subcategoryGroups.category,
    })
    .from(subcategoryGroups)
    .leftJoin(mediaAssets, eq(subcategoryGroups.iconMediaId, mediaAssets.id))
    .where(and(eq(subcategoryGroups.category, category), eq(subcategoryGroups.slug, slug)))
    .limit(1);
  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        iconSrc: row.iconMediaId && row.iconFilename ? mediaPath(row.iconMediaId, row.iconFilename) : null,
      }
    : null;
}

/** First two subcategory names in each category, for the homepage room cards. */
export async function subcategoryPreviewLines(db: Db): Promise<Partial<Record<CategorySlug, string[]>>> {
  const rows = await db
    .select({
      category: subcategoryGroups.category,
      name: subcategoryGroups.name,
    })
    .from(subcategoryGroups)
    .orderBy(asc(subcategoryGroups.category), asc(subcategoryGroups.position), asc(subcategoryGroups.name));
  const lines: Partial<Record<CategorySlug, string[]>> = {};
  for (const row of rows) {
    const list = lines[row.category] ?? [];
    if (list.length >= 2) continue;
    list.push(row.name);
    lines[row.category] = list;
  }
  return lines;
}

/** The subcategory buttons an article can be filed under, each with the topics it offers. */
export async function listSubcategoryChoices(db: Db) {
  const [groups, items] = await Promise.all([
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
        id: subcategories.id,
        groupId: subcategories.groupId,
        slug: subcategories.slug,
        name: subcategories.name,
      })
      .from(subcategories)
      .orderBy(asc(subcategories.position), asc(subcategories.name)),
  ]);
  return groups.map(({ slug, ...group }) => ({
    ...group,
    topics: items
      .filter((item) => item.groupId === group.id && item.slug !== slug)
      .map(({ id, name }) => ({ id, name })),
  }));
}

/** Topics shown on a subcategory page. A topic with the subcategory’s own address is only a filing placeholder. */
export async function listTopicsForGroup(
  db: Db,
  groupId: string,
  groupSlug: string,
): Promise<{ id: string; slug: string; name: string }[]> {
  const rows = await db
    .select({
      id: subcategories.id,
      slug: subcategories.slug,
      name: subcategories.name,
    })
    .from(subcategories)
    .where(eq(subcategories.groupId, groupId))
    .orderBy(asc(subcategories.position), asc(subcategories.name));
  return rows.filter((row) => row.slug !== groupSlug);
}
/**
 * Breadcrumbs for where an article sits under its category: the subcategory and, when one was
 * chosen, the topic. A topic with the subcategory's own address is only a filing placeholder.
 */
export async function guideSection(
  db: Db,
  guide: { category: CategorySlug | null; subcategoryId: string | null; subcategoryGroupId: string | null },
): Promise<{ name: string; href: string }[]> {
  const category = guide.category;
  if (!category) return [];
  const topicRow = guide.subcategoryId
    ? (
        await db
          .select({ slug: subcategories.slug, name: subcategories.name, groupId: subcategories.groupId })
          .from(subcategories)
          .where(and(eq(subcategories.id, guide.subcategoryId), eq(subcategories.category, category)))
          .limit(1)
      )[0]
    : undefined;
  const groupId = guide.subcategoryGroupId ?? topicRow?.groupId;
  if (!groupId) return [];
  const [group] = await db
    .select({ slug: subcategoryGroups.slug, name: subcategoryGroups.name })
    .from(subcategoryGroups)
    .where(and(eq(subcategoryGroups.id, groupId), eq(subcategoryGroups.category, category)))
    .limit(1);
  if (!group) return [];
  const crumbs = [{ name: group.name, href: subcategoryPath(category, group.slug) }];
  if (topicRow && topicRow.groupId === groupId && topicRow.slug !== group.slug) {
    crumbs.push({ name: topicRow.name, href: subcategoryPath(category, topicRow.slug) });
  }
  return crumbs;
}

export async function groupIdForSubcategory(db: Db, subcategoryId: string | null): Promise<string | null> {
  if (!subcategoryId) return null;
  const [row] = await db
    .select({ groupId: subcategories.groupId })
    .from(subcategories)
    .where(eq(subcategories.id, subcategoryId))
    .limit(1);
  return row?.groupId ?? null;
}

export async function listAdminGroups(db: Db): Promise<AdminSubcategoryGroup[]> {
  const groups = await db
    .select({
      id: subcategoryGroups.id,
      category: subcategoryGroups.category,
      slug: subcategoryGroups.slug,
      name: subcategoryGroups.name,
      description: subcategoryGroups.description,
      iconMediaId: subcategoryGroups.iconMediaId,
      iconFilename: mediaAssets.filename,
    })
    .from(subcategoryGroups)
    .leftJoin(mediaAssets, eq(subcategoryGroups.iconMediaId, mediaAssets.id))
    .orderBy(asc(subcategoryGroups.category), asc(subcategoryGroups.position), asc(subcategoryGroups.name));
  const items = await db
    .select({
      id: subcategories.id,
      groupId: subcategories.groupId,
      slug: subcategories.slug,
      name: subcategories.name,
    })
    .from(subcategories)
    .orderBy(asc(subcategories.position), asc(subcategories.name));
  return groups.map((group) => ({
    id: group.id,
    category: group.category,
    slug: group.slug,
    name: group.name,
    description: group.description,
    iconMediaId: group.iconMediaId,
    iconSrc: group.iconMediaId && group.iconFilename ? mediaPath(group.iconMediaId, group.iconFilename) : null,
    subcategories: items
      .filter((item) => item.groupId === group.id)
      .map(({ id, slug, name }) => ({ id, slug, name })),
  }));
}

export async function createGroup(db: Db, actor: Actor, raw: unknown): Promise<{ id: string }> {
  assertManager(actor);
  const parsed = createGroupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SubcategoryFormError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      subcategoryFieldErrors(parsed.error),
    );
  }
  const content = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      const [countRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(subcategoryGroups)
        .where(eq(subcategoryGroups.category, content.category));
      if ((countRow?.n ?? 0) >= SUBCATEGORY_LIMITS.groupsMax) {
        throw new SubcategoryFormError(
          `A category can have at most ${SUBCATEGORY_LIMITS.groupsMax} sections.`,
        );
      }
      const slug = slugify(content.name);
      if (!isValidSlug(slug)) {
        throw new SubcategoryFormError("Use a name made of letters or numbers.", {
          name: "Use a name made of letters or numbers.",
        });
      }
      if ((await articleUsesSlug(tx, slug)) || (await categorySlugTaken(tx, content.category, slug))) {
        throw new SubcategoryFormError("That address is already in use. Choose a different name.", {
          name: "That address is already in use.",
        });
      }
      if (content.iconMediaId) {
        const [asset] = await tx
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, content.iconMediaId))
          .limit(1);
        if (!asset) throw new SubcategoryFormError("Upload a valid subcategory image icon.");
      }
      const position = await nextGroupPosition(tx, content.category);
      const [created] = await tx
        .insert(subcategoryGroups)
        .values({ ...content, slug, position })
        .returning({ id: subcategoryGroups.id });
      if (!created) throw new Error("Section insert returned no row.");
      await audit(tx, {
        actorId: actor.id,
        action: "subcategory_group.created",
        entityType: "subcategory_group",
        entityId: created.id,
        details: { category: content.category, name: content.name },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof SubcategoryFormError) throw error;
    if (isUniqueViolation(error, "subcategory_groups_category_name")) {
      throw new SubcategoryFormError("That section name is already used in this category.", {
        name: "That section name is already used in this category.",
      });
    }
    if (isUniqueViolation(error, "subcategory_groups_category_slug")) {
      throw new SubcategoryFormError("That address is already in use. Choose a different name.", {
        name: "That address is already in use.",
      });
    }
    throw error;
  }
}

export async function updateGroup(db: Db, actor: Actor, id: string, raw: unknown): Promise<void> {
  assertManager(actor);
  const groupId = idOf(id, "Section");
  const parsed = groupFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SubcategoryFormError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      subcategoryFieldErrors(parsed.error),
    );
  }
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: subcategoryGroups.id, category: subcategoryGroups.category })
        .from(subcategoryGroups)
        .where(eq(subcategoryGroups.id, groupId))
        .limit(1);
      if (!existing) throw new UserInputError("Section not found.");
      if (parsed.data.iconMediaId) {
        const [asset] = await tx
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, parsed.data.iconMediaId))
          .limit(1);
        if (!asset) throw new SubcategoryFormError("Upload a valid subcategory image icon.");
      }
      await tx
        .update(subcategoryGroups)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(subcategoryGroups.id, groupId));
      await audit(tx, {
        actorId: actor.id,
        action: "subcategory_group.updated",
        entityType: "subcategory_group",
        entityId: groupId,
        details: { category: existing.category, name: parsed.data.name },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "subcategory_groups_category_name")) {
      throw new SubcategoryFormError("That section name is already used in this category.", {
        name: "That section name is already used in this category.",
      });
    }
    throw error;
  }
}

export async function deleteGroup(db: Db, actor: Actor, id: string): Promise<void> {
  assertManager(actor);
  const groupId = idOf(id, "Section");
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: subcategoryGroups.id, name: subcategoryGroups.name })
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.id, groupId))
      .limit(1);
    if (!existing) throw new UserInputError("Section not found.");
    const children = await tx
      .select({ id: subcategories.id })
      .from(subcategories)
      .where(eq(subcategories.groupId, groupId));
    if (children.length > 0) {
      const childIds = children.map((child) => child.id);
      const [guide] = await tx
        .select({ id: guides.id })
        .from(guides)
        .where(inArray(guides.subcategoryId, childIds))
        .limit(1);
      const [revision] = await tx
        .select({ id: guideRevisions.id })
        .from(guideRevisions)
        .where(inArray(guideRevisions.subcategoryId, childIds))
        .limit(1);
      if (guide || revision) {
        throw new SubcategoryFormError("Move the articles out of this subcategory before deleting it.");
      }
      await tx.delete(subcategories).where(eq(subcategories.groupId, groupId));
    }
    const [filed] = await tx
      .select({ id: guides.id })
      .from(guides)
      .where(eq(guides.subcategoryGroupId, groupId))
      .limit(1);
    if (filed) {
      throw new SubcategoryFormError("Move the articles out of this subcategory before deleting it.");
    }
    await tx.delete(subcategoryGroups).where(eq(subcategoryGroups.id, groupId));
    await audit(tx, {
      actorId: actor.id,
      action: "subcategory_group.deleted",
      entityType: "subcategory_group",
      entityId: groupId,
      details: { name: existing.name },
    });
  });
}

export async function createSubcategory(
  db: Db,
  actor: Actor,
  groupId: string,
  raw: unknown,
): Promise<{ id: string; slug: string }> {
  assertManager(actor);
  const parentId = idOf(groupId, "Section");
  const parsed = subcategoryNameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SubcategoryFormError(
      parsed.error.issues[0]?.message ?? "Check the name.",
      subcategoryFieldErrors(parsed.error),
    );
  }
  const slug = slugify(parsed.data.name);
  if (!isValidSlug(slug)) {
    throw new SubcategoryFormError("Use a name made of letters or numbers.", {
      name: "Use a name made of letters or numbers.",
    });
  }
  try {
    return await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: subcategoryGroups.id, category: subcategoryGroups.category })
        .from(subcategoryGroups)
        .where(eq(subcategoryGroups.id, parentId))
        .limit(1);
      if (!group) throw new UserInputError("Section not found.");
      if ((await articleUsesSlug(tx, slug)) || (await categorySlugTaken(tx, group.category, slug))) {
        throw new SubcategoryFormError("That address is already in use. Choose a different name.", {
          name: "That address is already in use.",
        });
      }
      const [countRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(subcategories)
        .where(eq(subcategories.groupId, parentId));
      if ((countRow?.n ?? 0) >= SUBCATEGORY_LIMITS.subcategoriesMax) {
        throw new SubcategoryFormError(
          `A section can have at most ${SUBCATEGORY_LIMITS.subcategoriesMax} subcategories.`,
        );
      }
      const position = await nextSubcategoryPosition(tx, parentId);
      const [created] = await tx
        .insert(subcategories)
        .values({
          groupId: parentId,
          category: group.category,
          slug,
          name: parsed.data.name,
          position,
        })
        .returning({ id: subcategories.id, slug: subcategories.slug });
      if (!created) throw new Error("Subcategory insert returned no row.");
      await audit(tx, {
        actorId: actor.id,
        action: "subcategory.created",
        entityType: "subcategory",
        entityId: created.id,
        details: { category: group.category, slug, name: parsed.data.name },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof SubcategoryFormError || error instanceof UserInputError) throw error;
    if (isUniqueViolation(error, "subcategories_category_slug")) {
      throw new SubcategoryFormError("A subcategory in this category already uses that address.", {
        name: "A subcategory in this category already uses that address.",
      });
    }
    if (isUniqueViolation(error, "subcategories_group_name")) {
      throw new SubcategoryFormError("That subcategory is already in this section.", {
        name: "That subcategory is already in this section.",
      });
    }
    throw error;
  }
}

export async function updateSubcategory(db: Db, actor: Actor, id: string, raw: unknown): Promise<void> {
  assertManager(actor);
  const subcategoryId = idOf(id, "Subcategory");
  const parsed = subcategoryNameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SubcategoryFormError(
      parsed.error.issues[0]?.message ?? "Check the name.",
      subcategoryFieldErrors(parsed.error),
    );
  }
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: subcategories.id, slug: subcategories.slug, category: subcategories.category })
        .from(subcategories)
        .where(eq(subcategories.id, subcategoryId))
        .limit(1);
      if (!existing) throw new UserInputError("Subcategory not found.");
      await tx
        .update(subcategories)
        .set({ name: parsed.data.name, updatedAt: new Date() })
        .where(eq(subcategories.id, subcategoryId));
      await audit(tx, {
        actorId: actor.id,
        action: "subcategory.updated",
        entityType: "subcategory",
        entityId: subcategoryId,
        details: { category: existing.category, slug: existing.slug, name: parsed.data.name },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "subcategories_group_name")) {
      throw new SubcategoryFormError("That subcategory is already in this section.", {
        name: "That subcategory is already in this section.",
      });
    }
    throw error;
  }
}

export async function deleteSubcategory(db: Db, actor: Actor, id: string): Promise<void> {
  assertManager(actor);
  const subcategoryId = idOf(id, "Subcategory");
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: subcategories.id, name: subcategories.name, slug: subcategories.slug })
      .from(subcategories)
      .where(eq(subcategories.id, subcategoryId))
      .limit(1);
    if (!existing) throw new UserInputError("Subcategory not found.");
    const [guideUse] = await tx
      .select({ id: guides.id })
      .from(guides)
      .where(eq(guides.subcategoryId, subcategoryId))
      .limit(1);
    const [revisionUse] = await tx
      .select({ id: guideRevisions.id })
      .from(guideRevisions)
      .where(eq(guideRevisions.subcategoryId, subcategoryId))
      .limit(1);
    if (guideUse || revisionUse) {
      throw new SubcategoryFormError(
        "This subcategory is used by an article. Move those articles before deleting it.",
      );
    }
    await tx.delete(subcategories).where(eq(subcategories.id, subcategoryId));
    await audit(tx, {
      actorId: actor.id,
      action: "subcategory.deleted",
      entityType: "subcategory",
      entityId: subcategoryId,
      details: { name: existing.name, slug: existing.slug },
    });
  });
}

/** Subcategory addresses that have at least one published article. */
export async function listSitemapSubcategories(db: Db) {
  const rows = await db
    .select({
      category: subcategories.category,
      slug: subcategories.slug,
      updatedAt: sql<Date | null>`max(${guides.publishedAt})`,
    })
    .from(subcategories)
    .innerJoin(guideRevisions, eq(guideRevisions.subcategoryId, subcategories.id))
    .innerJoin(guides, eq(guides.publishedRevisionId, guideRevisions.id))
    .groupBy(subcategories.category, subcategories.slug);
  return rows.flatMap((row) =>
    row.updatedAt ? [{ category: row.category, slug: row.slug, updatedAt: row.updatedAt }] : [],
  );
}

export function groupsForCategory(groups: readonly AdminSubcategoryGroup[], category: CategorySlug) {
  return groups.filter((group) => group.category === category);
}
