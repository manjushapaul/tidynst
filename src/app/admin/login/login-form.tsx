"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <Field label="Email">
        {(props) => (
          <input
            {...props}
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            className={inputClasses}
          />
        )}
      </Field>
      <Field label="Password">
        {(props) => (
          <input
            {...props}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            className={inputClasses}
          />
        )}
      </Field>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
