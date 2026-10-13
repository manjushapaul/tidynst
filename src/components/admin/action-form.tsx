"use client";

import { type ReactNode, useActionState } from "react";
import { cn } from "@/lib/cn";
import { CsrfField, SubmitButton } from "./form";

type State = { ok: boolean; message: string | null } | null;

type ActionFormProps = {
  action: (previous: State, formData: FormData) => Promise<State>;
  csrf: string;
  hidden?: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Asks for confirmation in the browser before submitting. */
  confirm?: string;
  children?: ReactNode;
  className?: string;
};

/** A compact form for single-purpose admin actions, showing the result inline. */
export function ActionForm({
  action,
  csrf,
  hidden,
  label,
  pendingLabel,
  variant = "secondary",
  confirm,
  children,
  className,
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={cn("flex flex-wrap items-center gap-2", className)}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <CsrfField token={csrf} />
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
      {state?.message ? (
        <span
          role={state.ok ? "status" : "alert"}
          className={cn("text-xs", state.ok ? "text-sage-deep" : "text-danger")}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
