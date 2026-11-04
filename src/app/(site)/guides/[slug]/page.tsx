import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { guidePath } from "@/content/categories";
import { loadPublishedGuide, redirectRenamedGuide } from "@/server/loaders";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/** Articles used to live at `/guides/<address>`; they now live under their category. */
export default async function LegacyGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = await loadPublishedGuide(slug);
  if (guide) permanentRedirect(guidePath(guide));
  await redirectRenamedGuide(slug);
  notFound();
}
