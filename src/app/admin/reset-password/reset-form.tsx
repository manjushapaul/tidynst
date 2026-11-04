"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { resetPasswordAction } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, null);
  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <Field label="New password" hint="At least 12 characters. A long passphrase works well.">
        {(props) => (
          <input
            {...props}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            className={inputClasses}
          />
        )}
      </Field>
      <Field label="Confirm new password">
        {(props) => (
          <input
            {...props}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            className={inputClasses}
          />
        )}
      </Field>
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
