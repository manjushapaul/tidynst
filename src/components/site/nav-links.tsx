"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActivePath, type NavItem } from "./navigation";

export function DesktopNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-2 text-[calc(0.92rem*var(--text-scale))] transition-colors duration-200",
                  active ? "bg-oak-pale text-oak-deep" : "text-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
