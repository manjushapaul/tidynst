import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { GuideDocument } from "@/components/content/guide-document";
import { subcategoryPath } from "@/content/categories";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { getDraftPreview } from "@/server/guides/queries";
import { loadPublicSite } from "@/server/loaders";
import { articleTopics, relatedGuides } from "@/server/public-content";
import { guideSection } from "@/server/subcategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false, nocache: true },
};

type Props = { params: Promise<{ id: string }> };

export default async function DraftPreviewPage({ params }: Props) {
  await connection();
  const { id } = await params;
  const session = await requireSession();
  const db = getDb();
  const guide = await getDraftPreview(db, session.user, id);
  if (!guide) notFound();
  const category = guide.category;
  const [related, areas, home, section] = await Promise.all([
    relatedGuides(db, guide),
    category ? articleTopics(db, category) : Promise.resolve([]),
    loadPublicSite(),
    guideSection(db, guide),
  ]);

  return (
    <GuideDocument
      guide={guide}
      related={related}
      section={section}
      topics={
        category
          ? areas.map((area) => ({
              id: area.id,
              name: area.name,
              href: subcategoryPath(category, area.slug),
            }))
          : []
      }
      structuredData={false}
      optimizeImages={false}
      siteName={home.name}
      categoryNames={Object.fromEntries(home.categories.map((category) => [category.slug, category.name]))}
      banner={
        <div className="sticky top-0 z-40 border-b border-warning/30 bg-warning-pale px-5 py-3 text-center text-sm font-semibold text-warning">
          <p>Draft Preview — Not Published</p>
          <p className="mt-1 font-normal">
            Only signed-in editors can see this page.{" "}
            <Link href={`/admin/guides/${guide.id}`} className="underline underline-offset-2">
              Back to the editor
            </Link>
          </p>
        </div>
      }
    />
  );
}
