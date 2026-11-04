"use client";

import { useActionState, useEffect, useRef } from "react";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { CONTACT_REPLY_LIMITS } from "@/lib/content/contact-schema";
import { replyToMessageAction } from "../actions";

export function ReplyForm({ csrf, messageId, to }: { csrf: string; messageId: string; to: string }) {
  const [state, formAction] = useActionState(replyToMessageAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <CsrfField token={csrf} />
      <input type="hidden" name="messageId" value={messageId} />
      <FormMessage state={state} />
      <Field
        label="Your reply"
        error={state?.fieldErrors?.body}
        hint={`Sent by email to ${to}. Their original message is quoted underneath.`}
      >
        {(props) => (
          <textarea
            {...props}
            name="body"
            required
            minLength={CONTACT_REPLY_LIMITS.min}
            maxLength={CONTACT_REPLY_LIMITS.max}
            rows={8}
            className={`${inputClasses} min-h-44 resize-y leading-relaxed`}
          />
        )}
      </Field>
      <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
    </form>
  );
}
