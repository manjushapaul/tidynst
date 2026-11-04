import Link from "next/link";

type SectionHeadingProps = {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  action?: { href: string; label: string };
};

export function SectionHeading({ id, eyebrow, title, lead, action }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id} className="mt-2 text-3xl leading-tight sm:text-4xl">
          {title}
        </h2>
        {lead ? <p className="mt-3 text-muted">{lead}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="shrink-0 text-sm font-medium text-oak-deep underline-offset-4 hover:underline"
        >
          {action.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
