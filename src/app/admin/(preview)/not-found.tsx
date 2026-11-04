import Link from "next/link";

export default function PreviewNotFound() {
  return (
    <section className="container-page py-20 sm:py-28">
      <div className="max-w-2xl">
        <p className="eyebrow">Not found</p>
        <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">There is no draft to preview here</h1>
        <p className="mt-5 text-lg text-muted">
          The article may have been deleted, or you may not have access to it.
        </p>
        <Link
          href="/admin/guides"
          className="mt-8 inline-block text-sm text-oak-deep underline underline-offset-2"
        >
          Back to articles
        </Link>
      </div>
    </section>
  );
}
