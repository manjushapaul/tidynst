import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-lg">
      <p className="text-xs font-medium tracking-wide text-oak-deep uppercase">Not found</p>
      <h1 className="mt-2 font-serif text-3xl">That page is not in the admin.</h1>
      <p className="mt-3 text-sm text-muted">It may have been deleted, or you may not have access to it.</p>
      <Link
        href="/admin/guides"
        className="mt-6 inline-block text-sm text-oak-deep underline underline-offset-2"
      >
        Back to articles
      </Link>
    </div>
  );
}
