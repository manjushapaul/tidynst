"use client";

import { useActionState, useState } from "react";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import type { ActionState } from "@/server/actions";
import { changeEmailAction } from "./actions";

export function EmailForm({ csrf, currentEmail }: { csrf: string; currentEmail: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [state, formAction] = useActionState(async (previous: ActionState, formData: FormData) => {
    const result = await changeEmailAction(previous, formData);
    if (result?.ok) setNewEmail("");
    return result;
  }, null);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <CsrfField token={csrf} />
      <FormMessage state={state} />
      <p className="text-sm text-muted">
        You sign in with <span className="font-medium break-all text-ink">{currentEmail}</span>.
      </p>
      <Field label="New email">
        {(props) => (
          <input
            {...props}
            name="newEmail"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      <Field label="Current password" hint="Confirms it is you. Other signed-in sessions will be signed out.">
        {(props) => (
          <input
            {...props}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            className={inputClasses}
          />
        )}
      </Field>
      <SubmitButton pendingLabel="Changing…">Change email</SubmitButton>
    </form>
  );
}
