"use client";

import { useActionState, useEffect, useRef } from "react";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { changePasswordAction } from "./actions";

export function PasswordForm({ csrf }: { csrf: string }) {
  const [state, formAction] = useActionState(changePasswordAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="max-w-md space-y-4">
      <CsrfField token={csrf} />
      <FormMessage state={state} />
      <Field label="Current password">
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
      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}
