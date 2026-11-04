import { FaqAccordion } from "@/components/site/faq-accordion";
import type { GuideFaq } from "@/db/schema";

export const FAQ_HEADING_ID = "article-faq";
export const FAQ_HEADING = "Frequently Asked Questions";

export function GuideFaqs({ faqs }: { faqs: readonly GuideFaq[] }) {
  if (faqs.length === 0) return null;
  return (
    <section aria-labelledby={FAQ_HEADING_ID} className="mt-14 scroll-mt-24 border-t border-line pt-10">
      <h2 id={FAQ_HEADING_ID} className="text-2xl">
        {FAQ_HEADING}
      </h2>
      <FaqAccordion faqs={faqs} />
    </section>
  );
}
