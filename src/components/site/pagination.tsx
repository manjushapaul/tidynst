import Link from "next/link";
import { cn } from "@/lib/cn";

export function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

/** Parses ?page=N. Returns null for anything that is not a positive integer. */
export function parsePage(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  if (typeof raw !== "string" || !/^[1-9]\d{0,4}$/.test(raw)) return null;
  return Number(raw);
}

export function Pagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const linkClass =
    "inline-flex min-w-10 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-sage hover:text-sage-deep";
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={pageHref(basePath, page - 1)} rel="prev" className={linkClass}>
          ← Newer guides
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted">
        Page {page} of {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={pageHref(basePath, page + 1)} rel="next" className={cn(linkClass)}>
          Older guides →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
