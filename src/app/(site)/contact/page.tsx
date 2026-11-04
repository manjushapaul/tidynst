import Link from "next/link";
import { PageHeader } from "@/components/site/page-header";
import { pageMetadata } from "@/lib/seo/metadata";
import { site } from "@/lib/site";
import { ContactForm } from "./contact-form";

export const metadata = pageMetadata({
  title: "Contact",
  description:
    "Send TidyNest a question, a correction or a suggestion for guides about organising small Indian homes.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <article>
      <PageHeader
        title="Contact"
        lead="Corrections, questions and suggestions for future guides are always welcome."
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Contact", href: "/contact" },
        ]}
      />
      <div className="container-page grid gap-14 py-12 sm:py-16 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-start lg:gap-20">
        <ContactForm />
        <div className="max-w-xl space-y-10 text-[calc(1.0625rem*var(--text-scale))] leading-relaxed">
          {site.contactEmail ? (
            <section>
              <h2 className="text-2xl">Or write directly</h2>
              <p className="mt-3 text-muted">
                You can also email{" "}
                <a
                  href={`mailto:${site.contactEmail}`}
                  className="text-oak-deep underline decoration-1 underline-offset-[3px] hover:decoration-2"
                >
                  {site.contactEmail}
                </a>
                . We read every message, although we cannot always reply individually.
              </p>
            </section>
          ) : null}
          <section>
            <h2 className="text-2xl">Corrections</h2>
            <p className="mt-3 text-muted">
              If you think something in a guide is wrong or out of date, tell us which page and what you
              noticed. We review every correction and update the guide when needed, as described in our{" "}
              <Link
                href="/editorial-policy"
                className="text-oak-deep underline decoration-1 underline-offset-[3px] hover:decoration-2"
              >
                editorial policy
              </Link>
              .
            </p>
          </section>
          <section>
            <h2 className="text-2xl">What we cannot help with</h2>
            <p className="mt-3 text-muted">
              We do not sell products, process orders or handle returns. For questions about a product you
              have bought, please contact the seller or manufacturer directly.
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
