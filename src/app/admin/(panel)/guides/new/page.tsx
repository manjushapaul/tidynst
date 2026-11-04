import type { Metadata } from "next";
import { GuideEditor } from "@/components/admin/guide-editor";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AccessDenied } from "@/components/admin/access-denied";
import { ARTICLE_IMAGE_DEFAULTS } from "@/lib/content/article-image-style";
import { FEATURED_IMAGE_DEFAULTS } from "@/lib/content/featured-image-style";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { listEditorProducts, listEditorTopics, listRecentMedia } from "@/server/guides/queries";
import { getHomepageContent } from "@/server/homepage";
import { listLinkTargets } from "@/server/link-targets";
import { listSubcategoryChoices } from "@/server/subcategories";
import { createGuideAction } from "../actions";
export const metadata: Metadata = { title: "Create Article" };

const empty = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  closing: "",
  category: null,
  subcategoryId: null,
  subcategoryGroupId: null,
  topicIds: [],
  products: [],
  seoTitle: null,
  seoDescription: null,
  featuredImageId: null,
  featuredImageAlt: null,
  featuredImageStyle: { ...FEATURED_IMAGE_DEFAULTS },
  faqs: [],
  articleImageStyle: { ...ARTICLE_IMAGE_DEFAULTS },
};

export default async function NewGuidePage() {
  const session = await requireSession();
  if (!can(session.user, "guide.create")) return <AccessDenied />;
  const db = getDb();
  const [topics, products, media, homepage, subcategoryChoices] = await Promise.all([
    listEditorTopics(db),
    listEditorProducts(db),
    listRecentMedia(db, null),
    getHomepageContent(db),
    listSubcategoryChoices(db),
  ]);
  const linkTargets = await listLinkTargets(db, homepage.categories);

  return (
    <>
      <AdminPageHeader
        title="Create Article"
        description="Creating an article saves an unpublished draft. It does not appear on the public site."
      />
      <GuideEditor
        csrf={session.csrfToken}
        action={createGuideAction}
        mode="create"
        initial={empty}
        version={1}
        everPublished={false}
        topics={topics}
        products={products}
        media={media}
        canDeleteMedia={can(session.user, "media.delete")}
        categoryChoices={homepage.categories}
        subcategoryChoices={subcategoryChoices}
        linkTargets={linkTargets}
      />
    </>
  );
}
