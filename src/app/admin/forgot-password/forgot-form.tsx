"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { forgotPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, null);
  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <Field label="Email" hint="We will email a reset link if this address has an admin account.">
        {(props) => (
          <input
            {...props}
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            className={inputClasses}
            disabled={Boolean(state?.ok)}
          />
        )}
      </Field>
      {state?.ok ? (
        <p className="text-center text-sm">
          <Link href="/admin/login" className="text-oak-deep underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      ) : (
        <SubmitButton className="w-full" pendingLabel="Sending…">
          Send reset link
        </SubmitButton>
      )}
    </form>
  );
}
