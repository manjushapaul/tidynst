import { Breadcrumbs, type Crumb } from "./breadcrumbs";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  breadcrumbs?: readonly Crumb[];
  children?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, lead, breadcrumbs, children }: PageHeaderProps) {
  return (
    <header className="border-b border-line bg-gradient-to-b from-sand/70 to-canvas">
      <div className="container-page pt-8 pb-12 sm:pt-10 sm:pb-16">
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        <div className="mt-8 max-w-3xl">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-3 text-4xl leading-[1.08] sm:text-5xl">{title}</h1>
          {lead ? <p className="mt-5 text-lg leading-relaxed text-muted">{lead}</p> : null}
          {children}
        </div>
      </div>
    </header>
  );
}
