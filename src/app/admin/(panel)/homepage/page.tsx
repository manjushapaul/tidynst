import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { mediaAssets } from "@/db/schema";
import { homepageMediaIds } from "@/lib/content/homepage-schema";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";
import { getDb } from "@/server/db";
import { listRecentMedia } from "@/server/guides/queries";
import { getHomepageContent } from "@/server/homepage";
import { mediaPath } from "@/server/public-content";
import { HomepageEditor } from "./editor";

export const metadata: Metadata = { title: "Homepage" };

export default async function HomepageAdminPage() {
  const session = await requireSession();
  if (!can(session.user, "site.manage")) return <AccessDenied />;
  const db = getDb();
  const content = await getHomepageContent(db);
  const media = await listRecentMedia(db, null);
  const missing = homepageMediaIds(content).filter((id) => !media.some((asset) => asset.id === id));
  if (missing.length > 0) {
    const extras = await db
      .select({
        id: mediaAssets.id,
        filename: mediaAssets.filename,
        contentType: mediaAssets.contentType,
        altText: mediaAssets.altText,
        width: mediaAssets.width,
        height: mediaAssets.height,
        byteSize: mediaAssets.byteSize,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, missing));
    media.unshift(
      ...extras.map((asset) => ({
        ...asset,
        src: mediaPath(asset.id, asset.filename),
        usedBy: "homepage" as const,
      })),
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Homepage"
        description="The words and pictures on the public homepage, the logo, and the category names in the header. Article addresses stay the same."
      />
      <HomepageEditor
        csrf={session.csrfToken}
        content={content}
        media={media}
        canDelete={can(session.user, "media.delete")}
      />
    </>
  );
}
