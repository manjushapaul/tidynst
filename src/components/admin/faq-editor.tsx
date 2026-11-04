"use client";

import type { GuideFaq } from "@/db/schema";
import { GUIDE_LIMITS } from "@/lib/content/guide-schema";
import { Field, inputClasses } from "./form";

export type FaqRow = GuideFaq & { key: string };

let lastKey = 0;

export function faqRows(faqs: readonly GuideFaq[]): FaqRow[] {
  return faqs.map((faq) => ({ ...faq, key: `faq-${(lastKey += 1)}` }));
}

/** Rows with neither a question nor an answer are dropped, so an unused blank row never blocks a save. */
export function faqsFromRows(rows: readonly FaqRow[]): GuideFaq[] {
  return rows
    .filter((row) => row.question.trim() !== "" || row.answer.trim() !== "")
    .map((row) => ({ question: row.question, answer: row.answer }));
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function FaqEditor({
  rows,
  onChange,
  error,
}: {
  rows: FaqRow[];
  onChange: (rows: FaqRow[]) => void;
  error?: string;
}) {
  const full = rows.length >= GUIDE_LIMITS.faqsMax;

  function update(key: string, change: Partial<GuideFaq>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function remove(row: FaqRow) {
    const hasText = row.question.trim() !== "" || row.answer.trim() !== "";
    if (hasText && !window.confirm("Do you want to remove this question from the FAQ?")) return;
    onChange(rows.filter((item) => item.key !== row.key));
  }

  return (
    <section aria-labelledby="faq-heading" className="space-y-3">
      <h2 id="faq-heading" className="font-sans text-sm font-semibold tracking-normal">
        FAQ
      </h2>
      <p className="text-xs text-muted">
        Shown at the end of the article in this order. Leave it empty and the article has no FAQ section. At
        most {GUIDE_LIMITS.faqsMax}.
      </p>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? <p className="text-sm text-muted">No questions yet.</p> : null}
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Question {index + 1}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-oak-deep"
                  disabled={index === 0}
                  onClick={() => onChange(move(rows, index, index - 1))}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="text-xs text-oak-deep"
                  disabled={index === rows.length - 1}
                  onClick={() => onChange(move(rows, index, index + 1))}
                >
                  Move down
                </button>
                <button type="button" className="text-xs text-danger" onClick={() => remove(row)}>
                  Remove
                </button>
              </div>
            </div>
            <Field label="Question">
              {(props) => (
                <input
                  {...props}
                  value={row.question}
                  maxLength={GUIDE_LIMITS.faqQuestionMax}
                  className={inputClasses}
                  onChange={(event) => update(row.key, { question: event.target.value })}
                />
              )}
            </Field>
            <Field label="Answer" hint="Plain text. Leave a blank line between paragraphs.">
              {(props) => (
                <textarea
                  {...props}
                  value={row.answer}
                  maxLength={GUIDE_LIMITS.faqAnswerMax}
                  rows={4}
                  className={inputClasses}
                  onChange={(event) => update(row.key, { answer: event.target.value })}
                />
              )}
            </Field>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="rounded-full border border-line-strong px-3 py-2 text-sm"
        disabled={full}
        onClick={() => onChange([...rows, ...faqRows([{ question: "", answer: "" }])])}
      >
        Add a question
      </button>
    </section>
  );
}
