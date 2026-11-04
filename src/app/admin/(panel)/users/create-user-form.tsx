"use client";

import { useActionState, useEffect, useRef } from "react";
import { CsrfField, Field, FormMessage, inputClasses, SubmitButton } from "@/components/admin/form";
import { createUserAction } from "./actions";

export function CreateUserForm({ csrf }: { csrf: string }) {
  const [state, formAction] = useActionState(createUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <CsrfField token={csrf} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          {(props) => (
            <input
              {...props}
              name="name"
              required
              maxLength={80}
              autoComplete="off"
              className={inputClasses}
            />
          )}
        </Field>
        <Field label="Email">
          {(props) => (
            <input
              {...props}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              className={inputClasses}
            />
          )}
        </Field>
        <Field label="Role">
          {(props) => (
            <select {...props} name="role" defaultValue="author" className={inputClasses}>
              <option value="author">Author — drafts and submits their own articles</option>
              <option value="editor">Editor — reviews, publishes and manages the homepage, topics and products</option>
              <option value="owner">Owner — everything, including users</option>
            </select>
          )}
        </Field>
        <Field
          label="Temporary password"
          hint="At least 12 characters. Ask them to change it after signing in."
        >
          {(props) => (
            <input
              {...props}
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              className={inputClasses}
            />
          )}
        </Field>
      </div>
      <SubmitButton pendingLabel="Creating…">Create user</SubmitButton>
    </form>
  );
}
