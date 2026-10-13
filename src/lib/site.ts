const DEFAULT_SITE_URL = "http://localhost:3000";

function normaliseSiteUrl(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_SITE_URL;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use https outside localhost.");
  }
  return url.origin;
}

function normaliseEmail(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export const site = {
  name: "TidyNest",
  tagline: "Calm, practical organising for small Indian homes",
  description:
    "Practical, honest guides to organising small Indian homes and rented apartments — kitchens, bathrooms, wardrobes and compact living.",
  url: normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "en_IN",
  language: "en-IN",
  editorialName: "TidyNest Editorial",
  contactEmail: normaliseEmail(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
} as const;

export function absoluteUrl(path: string): string {
  return new URL(path, site.url).toString();
}
