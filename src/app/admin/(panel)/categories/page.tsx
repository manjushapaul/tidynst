import type { Metadata } from "next";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CATEGORY_SLUGS, isCategorySlug } from "@/content/categories";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { getHomepageContent } from "@/server/homepage";
import { groupsForCategory, listAdminGroups } from "@/server/subcategories";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Categories" };

type Props = { searchParams: Promise<{ category?: string | string[] }> };

export default async function CategoriesPage({ searchParams }: Props) {
  const session = await requireSession();
  if (!can(session.user, "site.manage")) return <AccessDenied />;
  const db = getDb();
  const [home, groups] = await Promise.all([getHomepageContent(db), listAdminGroups(db)]);
  const sections = CATEGORY_SLUGS.map((slug) => {
    const category = home.categories.find((item) => item.slug === slug);
    return {
      slug,
      name: category?.name ?? slug,
      intro: category?.intro ?? "",
      groups: groupsForCategory(groups, slug),
    };
  });
  const requested = (await searchParams).category;
  const active = typeof requested === "string" && isCategorySlug(requested) ? requested : CATEGORY_SLUGS[0];

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="Pick a category to edit its description and subcategories. Subcategory names are the buttons on the category page. Topics added under a subcategory appear as labels on that subcategory’s page."
      />
      <CategoryManager csrf={session.csrfToken} sections={sections} active={active} />
    </>
  );
}
