"use client";

import { type ReactNode, useActionState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { CsrfField, SubmitButton } from "./form";
import { useWorkflowAnnounce } from "./workflow-status";

type State = { ok: boolean; message: string | null; redirectTo?: string } | null;

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

/**
 * A compact form for single-purpose admin actions. The result is shown inline, or by the
 * surrounding `WorkflowStatusProvider` when there is one, so it survives this form unmounting.
 */
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
  const announce = useWorkflowAnnounce();
  const reported = useCallback(
    async (previous: State, formData: FormData) => {
      const result = await action(previous, formData);
      announce?.(result);
      return result;
    },
    [action, announce],
  );
  const [state, formAction] = useActionState(announce ? reported : action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [router, state]);
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
      {!announce && state?.message ? (
        <span
          role={state.ok ? "status" : "alert"}
          className={cn("text-xs", state.ok ? "text-oak-deep" : "text-danger")}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
