import Link from "next/link";
import { site } from "@/lib/site";
import { Logo } from "./logo";
import { companyNav, legalNav, primaryNav } from "./navigation";

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h2 className="font-sans text-sm font-semibold tracking-normal text-ink">{title}</h2>
      <ul className="mt-4 grid gap-2.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-sm text-muted transition-colors hover:text-ink">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-sand/60">
      <div className="container-page grid gap-12 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">{site.tagline}.</p>
        </div>
        <FooterColumn title="Explore" items={primaryNav} />
        <FooterColumn title="TidyNest" items={companyNav} />
        <FooterColumn title="Policies" items={legalNav} />
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}. Independent editorial content.
          </p>
          <p>We do not earn commission from links on this site at present.</p>
        </div>
      </div>
    </footer>
  );
}
