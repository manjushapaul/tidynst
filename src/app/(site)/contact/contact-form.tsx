"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { CONTACT_TOPICS, CONTACT_TOPIC_LABELS } from "@/lib/content/contact-schema";
import { sendContactMessage } from "./actions";

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactMessage, null);

  return (
    <form
      action={formAction}
      className="relative rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-8"
    >
      <p className="eyebrow">Write to us</p>
      <h2 className="mt-3 text-3xl leading-tight">Send a message</h2>
      {state?.ok ? (
        <p role="status" className="mt-6 text-lg leading-relaxed text-oak-deep">
          {state.message}
        </p>
      ) : (
        <div className="mt-7 space-y-5">
          <FormMessage state={state} />
          <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
            <label>
              Website
              <input name="website" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" error={state?.fieldErrors?.name}>
              {(props) => (
                <input
                  {...props}
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={80}
                  className={inputClasses}
                />
              )}
            </Field>
            <Field label="Email" error={state?.fieldErrors?.email}>
              {(props) => (
                <input
                  {...props}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  className={inputClasses}
                />
              )}
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink">What is this about?</legend>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {CONTACT_TOPICS.map((topic) => (
                <label key={topic} className="cursor-pointer">
                  <input
                    type="radio"
                    name="topic"
                    value={topic}
                    required
                    className="peer sr-only"
                    defaultChecked={topic === "question"}
                  />
                  <span className="block rounded-full border border-line bg-canvas px-3 py-2.5 text-center text-sm font-medium transition-colors peer-checked:border-oak peer-checked:bg-oak-pale peer-checked:text-oak-deep peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-oak">
                    {CONTACT_TOPIC_LABELS[topic]}
                  </span>
                </label>
              ))}
            </div>
            {state?.fieldErrors?.topic ? (
              <p className="mt-1.5 text-xs font-medium text-danger">{state.fieldErrors.topic}</p>
            ) : null}
          </fieldset>
          <Field
            label="Message"
            hint="For a correction, name the guide and what looks wrong."
            error={state?.fieldErrors?.message}
          >
            {(props) => (
              <textarea
                {...props}
                name="message"
                required
                minLength={20}
                maxLength={4000}
                rows={6}
                className={`${inputClasses} min-h-40 resize-y leading-relaxed`}
              />
            )}
          </Field>
          <SubmitButton className="w-full sm:w-auto" pendingLabel="Sending…">
            Send message
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
