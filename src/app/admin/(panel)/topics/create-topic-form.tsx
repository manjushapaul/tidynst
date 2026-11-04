"use client";

import { useActionState, useEffect, useRef } from "react";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { TOPIC_LIMITS } from "@/lib/content/topic-schema";
import { createTopicAction } from "./actions";

export function CreateTopicForm({ csrf }: { csrf: string }) {
  const [state, formAction] = useActionState(createTopicAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  const errors = state?.fieldErrors ?? {};

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <CsrfField token={csrf} />
      <FormMessage state={state} />
      <Field label="Name" error={errors.name} hint="The address is filled in from the name.">
        {(props) => (
          <input
            {...props}
            name="name"
            required
            minLength={TOPIC_LIMITS.nameMin}
            maxLength={TOPIC_LIMITS.nameMax}
            autoComplete="off"
            className={inputClasses}
          />
        )}
      </Field>
      <Field
        label="Description"
        error={errors.description}
        hint={`${TOPIC_LIMITS.descriptionMin}–${TOPIC_LIMITS.descriptionMax} characters. Shown on the topic page.`}
      >
        {(props) => (
          <textarea
            {...props}
            name="description"
            required
            minLength={TOPIC_LIMITS.descriptionMin}
            maxLength={TOPIC_LIMITS.descriptionMax}
            rows={3}
            className={inputClasses}
          />
        )}
      </Field>
      <SubmitButton pendingLabel="Adding…">Add topic</SubmitButton>
    </form>
  );
}
