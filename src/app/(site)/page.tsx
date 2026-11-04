import { CategoryGrid } from "@/components/site/category-grid";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { publicDb, loadPublicSite } from "@/server/loaders";
import { listPublishedGuides } from "@/server/public-content";
import { HeroArt } from "@/components/site/hero-art";
import { SectionHeading } from "@/components/site/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";

export async function generateMetadata() {
  const home = await loadPublicSite();
  return pageMetadata({
    title: `${home.name} — ${home.tagline}`,
    description: home.description,
    path: "/",
    absoluteTitle: true,
  });
}

export default async function HomePage() {
  const db = await publicDb();
  const [home, latest] = await Promise.all([loadPublicSite(), listPublishedGuides(db, { limit: 6 })]);
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd({ name: home.name, logoUrl: home.logo?.src ?? null }),
          websiteJsonLd({ name: home.name, description: home.description }),
        ]}
      />
      <section className="overflow-hidden">
        <div className="container-page grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <p className="eyebrow">{home.hero.eyebrow}</p>
            <h1 className="mt-4 text-[calc(2.6rem*var(--text-scale))] leading-[1.04] sm:text-6xl">
              {home.hero.title}
              <br />
              <span className="text-oak-deep italic">{home.hero.emphasis}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{home.description}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href={home.hero.ctaHref} variant="secondary" ripple className="hero-cta text-oak-deep! hover:text-[#fffdf8]! focus-visible:text-[#fffdf8]!">
                {home.hero.ctaLabel}
              </ButtonLink>
            </div>
          </div>
          <HeroArt image={home.hero.image} />
        </div>
      </section>

      <section aria-labelledby="rooms-heading" className="container-page pb-16 sm:pb-20">
        <SectionHeading
          id="rooms-heading"
          eyebrow={home.rooms.eyebrow}
          title={home.rooms.title}
          lead={home.rooms.lead}
        />
        <div className="mt-12">
          <CategoryGrid categories={home.categories} linkLabel={home.rooms.cardLinkLabel} />
        </div>
      </section>

      <section aria-labelledby="latest-heading" className="container-page pb-16 sm:pb-20">
        <SectionHeading
          id="latest-heading"
          eyebrow={home.latest.eyebrow}
          title={home.latest.title}
          action={latest.length ? { href: "/guides", label: home.latest.linkLabel } : undefined}
        />
        <div className="mt-10">
          {latest.length ? (
            <GuideGrid guides={latest} />
          ) : (
            <EmptyState title={home.latest.emptyTitle}>{home.latest.emptyBody}</EmptyState>
          )}
        </div>
      </section>

      <section aria-labelledby="principles-heading" className="border-y border-line bg-surface">
        <div className="container-page py-16 sm:py-20">
          <SectionHeading
            id="principles-heading"
            eyebrow={home.principles.eyebrow}
            title={home.principles.title}
          />
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {home.principles.items.map((principle, index) => (
              <li key={principle.title} className="border-t border-line pt-6">
                <span aria-hidden="true" className="font-serif text-sm text-oak">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-xl">{principle.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{principle.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
