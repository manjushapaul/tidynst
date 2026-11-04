import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className="underline underline-offset-2">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <p>
        Page {Math.min(page, totalPages)} of {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className="underline underline-offset-2">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
