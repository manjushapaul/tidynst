import { categories, categoryPath } from "@/content/categories";

export type NavItem = { href: string; label: string };

export const primaryNav: readonly NavItem[] = categories.map((category) => ({
  href: categoryPath(category.slug),
  label: category.navLabel,
}));

export const companyNav: readonly NavItem[] = [
  { href: "/about", label: "About" },
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/contact", label: "Contact" },
];

export const legalNav: readonly NavItem[] = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/affiliate-disclosure", label: "Affiliate disclosure" },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
