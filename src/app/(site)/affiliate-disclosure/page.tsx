import Link from "next/link";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { site } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Affiliate disclosure",
  description:
    "TidyNest does not currently earn commission from any links. Here is how we will label shopping links if that changes.",
  path: "/affiliate-disclosure",
});

export default function AffiliateDisclosurePage() {
  return (
    <StaticPage
      title="Affiliate disclosure"
      lead="An honest account of how TidyNest handles shopping links and money."
      path="/affiliate-disclosure"
      lastUpdated="13 October 2026"
    >
      <h2>Where things stand today</h2>
      <p>
        {site.name} does not currently earn commission from any links on this site, and we are not a member of
        any affiliate programme. When a guide links to a product or shop, it is because we think the link is
        useful, and we receive nothing if you buy.
      </p>

      <h2>If this changes</h2>
      <p>
        We may join affiliate programmes in the future to help fund the site. If we do, we will update this
        page first, and every guide that contains affiliate links will say so clearly near the top of the page
        and next to the links themselves.
      </p>

      <h2>What money will never change</h2>
      <ul>
        <li>We will not recommend a product because it pays a higher commission.</li>
        <li>We will not publish invented reviews, ratings or testing claims.</li>
        <li>We will not show prices or discounts, because they change quickly and vary by seller.</li>
        <li>Products are never ranked or included in exchange for payment.</li>
      </ul>
      <p>
        Read more about how we choose what to recommend in our{" "}
        <Link href="/editorial-policy">editorial policy</Link>.
      </p>
    </StaticPage>
  );
}
