import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { site } from "@/lib/site";
import { loadPublicSite } from "@/server/loaders";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export async function generateMetadata(): Promise<Metadata> {
  let name: string = site.name;
  let tagline: string = site.tagline;
  let description: string = site.description;
  try {
    const home = await loadPublicSite();
    name = home.name;
    tagline = home.tagline;
    description = home.description;
  } catch {
    // The built-in brand is used when the database cannot be read.
  }
  return {
    metadataBase: new URL(site.url),
    title: { default: `${name} — ${tagline}`, template: `%s | ${name}` },
    description,
    applicationName: name,
    formatDetection: { telephone: false, email: false, address: false },
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
      : {}),
  };
}

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={site.language} className={`${inter.variable} ${fraunces.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
