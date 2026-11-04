"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { GuideFaq } from "@/db/schema";

export function FaqAccordion({ faqs }: { faqs: readonly GuideFaq[] }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const baseId = useId();

  function toggle(index: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="mt-6 divide-y divide-line border-y border-line">
      {faqs.map((faq, index) => {
        const expanded = open.has(index);
        const buttonId = `${baseId}-q${index}`;
        const panelId = `${baseId}-a${index}`;
        return (
          <div key={index}>
            <h3 className="font-sans text-base font-medium tracking-normal text-pretty sm:text-[calc(1.0625rem*var(--text-scale))]">
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="group flex w-full items-start justify-between gap-5 py-5 text-left leading-snug text-ink transition-colors hover:text-oak-deep"
              >
                <span className="min-w-0">{faq.question}</span>
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="mt-[0.2em] size-4 shrink-0 text-muted transition-colors group-hover:text-oak-deep"
                >
                  <path d="M2.5 8h11" />
                  <path
                    d="M8 2.5v11"
                    className={cn(
                      "origin-center transition-transform duration-300 ease-(--ease-gentle)",
                      expanded && "scale-y-0",
                    )}
                  />
                </svg>
              </button>
            </h3>
            <div
              id={panelId}
              inert={!expanded}
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-(--ease-gentle)",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-3 pr-9 pb-6 leading-relaxed text-ink/85">
                  {faq.answer.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
