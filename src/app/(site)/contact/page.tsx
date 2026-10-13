import Link from "next/link";
import { StaticPage } from "@/components/site/static-page";
import { pageMetadata } from "@/lib/seo/metadata";
import { site } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Contact",
  description:
    "How to contact TidyNest with corrections, questions or suggestions for guides about organising small Indian homes.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <StaticPage
      title="Contact"
      lead="Corrections, questions and suggestions for future guides are always welcome."
      path="/contact"
    >
      <h2>Email us</h2>
      {site.contactEmail ? (
        <p>
          Write to <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>. We read every message,
          although we cannot always reply individually.
        </p>
      ) : (
        <p>
          Our contact email address will be published here before the site launches. Until then, we are not
          able to accept messages.
        </p>
      )}

      <h2>Corrections</h2>
      <p>
        If you think something in a guide is wrong or out of date, please tell us which page and what you
        noticed. We review every correction request and update the guide when needed, as described in our{" "}
        <Link href="/editorial-policy">editorial policy</Link>.
      </p>

      <h2>What we cannot help with</h2>
      <p>
        We do not sell products, process orders or handle returns. For questions about a product you have
        bought, please contact the seller or manufacturer directly.
      </p>
    </StaticPage>
  );
}
