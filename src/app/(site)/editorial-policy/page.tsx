import Link from "next/link";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { site } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Editorial policy",
  description:
    "How TidyNest researches, reviews, updates and corrects its guides, and the standards we follow for product recommendations.",
  path: "/editorial-policy",
});

export default function EditorialPolicyPage() {
  return (
    <StaticPage
      title="Editorial policy"
      lead="The standards every TidyNest guide is held to before it is published, and after."
      path="/editorial-policy"
      lastUpdated="13 October 2026"
    >
      <h2>Useful first</h2>
      <p>
        Every guide starts from a real problem in a small Indian home — not from a product we want to mention.
        We aim to answer the question fully, including when the best answer is to buy nothing at all.
      </p>

      <h2>Honest about our sources</h2>
      <p>
        Our guides draw on practical organising principles and on information published by manufacturers and
        sellers, such as dimensions and materials. When a detail comes from a manufacturer, we present it as
        the manufacturer&apos;s claim. When we have not used a product ourselves, we do not imply that we
        have.
      </p>
      <p>We never invent reviews, ratings, testimonials, testing results, prices, or author credentials.</p>

      <h2>Reviewed before publishing</h2>
      <p>
        Each guide is reviewed by a member of the {site.name} team before it is published. If a guide is
        changed after it has been reviewed, it must be reviewed again before the change goes live.
      </p>

      <h2>Product recommendations</h2>
      <ul>
        <li>We recommend products only when they genuinely help solve the problem the guide is about.</li>
        <li>We check product details against the manufacturer or seller listing before including them.</li>
        <li>We do not show prices, because they change frequently and vary by seller.</li>
        <li>
          We currently earn nothing from product links. Our{" "}
          <Link href="/affiliate-disclosure">affiliate disclosure</Link> explains how this would be labelled
          if it changes.
        </li>
      </ul>

      <h2>Safety</h2>
      <p>
        Organising sometimes involves weight, heights, water and heat. Always follow the manufacturer&apos;s
        instructions for installation and load limits, and check your rental agreement before making changes
        to walls or fittings.
      </p>

      <h2>Updates and corrections</h2>
      <p>
        We revisit guides to keep them accurate, and show the date a guide was last updated. If you spot an
        error, please <Link href="/contact">contact us</Link>. We correct factual mistakes promptly.
      </p>
    </StaticPage>
  );
}
