import { CategoryGrid } from "@/components/site/category-grid";
import { EmptyState, GuideGrid } from "@/components/site/guide-card";
import { publicDb } from "@/server/loaders";
import { listPublishedGuides } from "@/server/public-content";
import { HeroArt } from "@/components/site/hero-art";
import { SectionHeading } from "@/components/site/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";
import { site } from "@/lib/site";

export const metadata = pageMetadata({
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  path: "/",
  absoluteTitle: true,
});

const principles = [
  {
    title: "Made for Indian homes",
    body: "Steel almirahs, masala dabbas, wet bathrooms and rented flats — advice that fits how we actually live.",
  },
  {
    title: "Small-space first",
    body: "Every idea is judged by whether it works in a 1BHK or a compact 2BHK, not in a showroom.",
  },
  {
    title: "Honest by default",
    body: "No invented reviews, ratings or prices. We say where information comes from, and we update guides when it changes.",
  },
];

export default async function HomePage() {
  const latest = await listPublishedGuides(await publicDb(), { limit: 6 });
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <section className="overflow-hidden border-b border-line bg-gradient-to-b from-sand/80 to-canvas">
        <div className="container-page grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <p className="eyebrow">Organising for small homes</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.04] sm:text-6xl">
              A calmer home,
              <br />
              <span className="text-sage-deep italic">one corner at a time</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{site.description}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/guides">Browse all guides</ButtonLink>
              <ButtonLink href="/categories/renters" variant="secondary">
                Ideas for renters
              </ButtonLink>
            </div>
          </div>
          <HeroArt />
        </div>
      </section>

      <section aria-labelledby="rooms-heading" className="container-page py-16 sm:py-20">
        <SectionHeading
          id="rooms-heading"
          eyebrow="Start with a room"
          title="Where does your home need help?"
          lead="Five focused areas, each with guides written for compact Indian homes."
        />
        <div className="mt-10">
          <CategoryGrid />
        </div>
      </section>

      <section aria-labelledby="latest-heading" className="container-page pb-16 sm:pb-20">
        <SectionHeading
          id="latest-heading"
          eyebrow="Fresh from the editors"
          title="Latest guides"
          action={latest.length ? { href: "/guides", label: "All guides" } : undefined}
        />
        <div className="mt-10">
          {latest.length ? (
            <GuideGrid guides={latest} />
          ) : (
            <EmptyState title="Our first guides are on their way">
              Every guide is written and reviewed before it is published. Check back soon.
            </EmptyState>
          )}
        </div>
      </section>

      <section aria-labelledby="principles-heading" className="border-y border-line bg-surface">
        <div className="container-page py-16 sm:py-20">
          <SectionHeading
            id="principles-heading"
            eyebrow="Our approach"
            title="What you can expect from us"
          />
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {principles.map((principle, index) => (
              <li key={principle.title} className="border-t border-line pt-6">
                <span aria-hidden="true" className="font-serif text-sm text-sage">
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
