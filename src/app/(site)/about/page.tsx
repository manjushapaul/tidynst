import Link from "next/link";
import type { Metadata } from "next";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { site } from "@/lib/site";
import { loadPublicSite } from "@/server/loaders";

export async function generateMetadata(): Promise<Metadata> {
  const home = await loadPublicSite();
  return pageMetadata({
    title: `About ${home.name}`,
    description: `${home.name} publishes practical, honest guides to organising small Indian homes and rented apartments. Here is what we cover and how we work.`,
    path: "/about",
  });
}

export default async function AboutPage() {
  const home = await loadPublicSite();
  return (
    <StaticPage
      title={`About ${home.name}`}
      lead="Practical guides for people who live in small homes and want them to feel calmer, without a renovation budget."
      path="/about"
    >
      <h2>Why {home.name} exists</h2>
      <p>
        Most organising advice online is written for large houses with walk-in closets and deep pantries. Many
        of us live differently: a 1BHK in a city, a rented flat where drilling is not allowed, a kitchen where
        the pressure cooker, the mixer grinder and a dozen masala dabbas share one platform.
      </p>
      <p>
        {home.name} focuses on those homes. Our guides are written for Indian households — the rooms, the
        cooking, the clothing and the rental realities that come with them.
      </p>

      <h2>What we cover</h2>
      <ul>
        <li>
          <Link href="/categories/kitchen">Kitchens</Link> — spices, counters, cabinets and storage that suits
          Indian cooking.
        </li>
        <li>
          <Link href="/categories/bathroom">Bathrooms</Link> — storage that copes with wet floors, tiles and
          humidity.
        </li>
        <li>
          <Link href="/categories/bedroom-wardrobe">Bedrooms and wardrobes</Link> — almirahs, sarees, seasonal
          clothing and bedding.
        </li>
        <li>
          <Link href="/categories/small-apartments">Small apartments</Link> — making every room in a compact
          home work harder.
        </li>
        <li>
          <Link href="/categories/renters">Renting</Link> — removable, no-drill and portable ideas that
          protect your deposit.
        </li>
      </ul>

      <h2>How we work</h2>
      <p>
        Every guide is written and reviewed before it is published, and we update guides when we learn
        something new or find a mistake. We say clearly what our advice is based on, and we never invent
        reviews, ratings, prices or testing claims. You can read the details in our{" "}
        <Link href="/editorial-policy">editorial policy</Link>.
      </p>
      <p>
        Guides are published under the name {site.editorialName}. We do not publish fictional authors or claim
        qualifications we do not have.
      </p>

      <h2>Get in touch</h2>
      <p>
        Spotted an error, or want us to cover a particular problem in your home? Visit our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </StaticPage>
  );
}
