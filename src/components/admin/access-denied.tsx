import Link from "next/link";

export function AccessDenied({
  message = "Your role does not include access to this page.",
}: {
  message?: string;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl">Not available</h1>
      <p className="mt-3 text-sm text-muted">{message}</p>
      <Link href="/admin" className="mt-6 inline-block text-sm text-sage-deep underline underline-offset-2">
        Back to the dashboard
      </Link>
    </div>
  );
}
