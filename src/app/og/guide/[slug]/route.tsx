import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getCategory } from "@/content/categories";
import { site } from "@/lib/site";
import { getDb } from "@/server/db";
import { getPublicHomepage } from "@/server/homepage";
import { getPublishedGuide } from "@/server/public-content";

/** The URL carries the guide's publish time, so a republished guide gets a new address. */
const CACHE = "public, max-age=3600, stale-while-revalidate=86400";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const db = getDb();
  const [guide, home] = await Promise.all([
    getPublishedGuide(db, slug),
    getPublicHomepage(db).catch(() => null),
  ]);
  if (!guide) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const name = home?.name ?? site.name;
  const categoryName = guide.category
    ? (home?.categories.find((category) => category.slug === guide.category)?.name ??
      getCategory(guide.category)?.name)
    : undefined;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "#faf7f2",
        color: "#1f1e1c",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 52, height: 52, borderRadius: 15, background: "#86643f", display: "flex" }} />
        <div style={{ fontSize: 36, fontWeight: 600 }}>{name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {categoryName ? (
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#86643f" }}>
            {categoryName}
          </div>
        ) : null}
        <div style={{ fontSize: guide.title.length > 80 ? 54 : 66, lineHeight: 1.08, maxWidth: 1040 }}>
          {guide.title}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", width: 160, height: 8, borderRadius: 4, background: "#86643f" }} />
        <div style={{ fontSize: 24, color: "#6b665e" }}>{new URL(site.url).host}</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": CACHE } },
  );
}
