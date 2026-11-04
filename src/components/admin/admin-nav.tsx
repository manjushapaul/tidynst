"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type AdminNavItem = { href: string; label: string; count?: number };

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-1 lg:mx-0">
      <ul className="flex flex-wrap gap-1 px-1 lg:flex-col lg:flex-nowrap lg:px-0">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-oak-pale font-medium text-oak-deep"
                    : "text-muted hover:bg-sand hover:text-ink",
                )}
              >
                {item.label}
                {item.count ? (
                  <span className="rounded-full bg-oak px-1.5 py-px text-[calc(0.7rem*var(--text-scale))] font-semibold text-white tabular-nums">
                    {item.count > 99 ? "99+" : item.count}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
