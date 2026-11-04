import type { NextConfig } from "next";
import { draftPreviewHeaders } from "./src/lib/http/preview-headers";
import { launchConfigProblem } from "./src/lib/seo/indexing";

const launchProblem = launchConfigProblem(process.env);
if (launchProblem) throw new Error(launchProblem);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    // Script and style sources are not restricted here because Next.js inlines bootstrap scripts;
    // a nonce-based script-src would force every page to render dynamically.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Matches the media route's public max-age, so optimized copies are not kept for hours after unpublishing.
    minimumCacheTTL: 300,
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/images/**" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/guides/:id/preview", headers: [...draftPreviewHeaders] },
    ];
  },
};

export default nextConfig;
