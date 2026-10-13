import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
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
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#5f6f52", display: "flex" }} />
        <div style={{ fontSize: 44, fontWeight: 600 }}>{site.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 68, lineHeight: 1.05, maxWidth: 900 }}>{site.tagline}</div>
        <div style={{ display: "flex", width: 160, height: 8, borderRadius: 4, background: "#5f6f52" }} />
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
