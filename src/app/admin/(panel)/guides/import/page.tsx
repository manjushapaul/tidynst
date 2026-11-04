import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { WordImport } from "@/components/admin/word-import";
import { can } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/request";

export const metadata: Metadata = { title: "Import Word document" };

export default async function ImportWordPage() {
  const session = await requireSession();
  if (!can(session.user, "guide.create")) return <AccessDenied />;
  return (
    <>
      <Link href="/admin/guides" className="text-sm text-oak-deep underline-offset-2 hover:underline">
        ← All articles
      </Link>
      <div className="mt-4">
        <AdminPageHeader
          title="Import Word document"
          description="Add or update many articles at once from one Word document. An article whose title matches an existing article updates it as a new draft; the rest become new drafts. Nothing is published, and images added in the editor are kept."
        />
      </div>
      <WordImport csrf={session.csrfToken} />
    </>
  );
}
