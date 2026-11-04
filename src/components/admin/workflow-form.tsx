"use client";

import { useActionState, useCallback, useId, useState } from "react";
import type { ActionState } from "@/server/actions";
import { ControlledCheckbox, CsrfField, FormMessage, inputClasses, SubmitButton } from "./form";
import { useWorkflowAnnounce } from "./workflow-status";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  csrf: string;
  hidden: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
  note?: { name: string; label: string; hint?: string; required?: boolean; maxLength: number };
  /** A required confirmation checkbox, sent as `confirm=yes`. */
  confirmLabel?: string;
  /** Asks for confirmation in the browser before submitting. */
  confirm?: string;
};

/**
 * Review and publishing actions. Typed notes survive a failed submission. Inside a
 * `WorkflowStatusProvider` the result is shown by the provider, so it outlives this form.
 */
export function WorkflowForm({
  action,
  csrf,
  hidden,
  label,
  pendingLabel,
  variant = "secondary",
  note,
  confirmLabel,
  confirm,
}: Props) {
  const announce = useWorkflowAnnounce();
  const reported = useCallback(
    async (previous: ActionState, formData: FormData) => {
      const result = await action(previous, formData);
      announce?.(result);
      return result;
    },
    [action, announce],
  );
  const [state, formAction] = useActionState(announce ? reported : action, null);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [seen, setSeen] = useState<ActionState>(null);
  const id = useId();
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) {
      setText("");
      setConfirmed(false);
    }
  }
  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <CsrfField token={csrf} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {note ? (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-note`} className="block text-sm font-medium">
            {note.label}
          </label>
          <textarea
            id={`${id}-note`}
            name={note.name}
            rows={3}
            maxLength={note.maxLength}
            required={note.required}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-describedby={note.hint ? `${id}-hint` : undefined}
            className={inputClasses}
          />
          {note.hint ? (
            <p id={`${id}-hint`} className="text-xs text-muted">
              {note.hint}
            </p>
          ) : null}
        </div>
      ) : null}
      {confirmLabel ? (
        <label className="flex items-start gap-2 text-sm">
          <ControlledCheckbox
            name="confirm"
            value="yes"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-1"
          />
          <span>{confirmLabel}</span>
        </label>
      ) : null}
      <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
      {announce ? null : <FormMessage state={state} />}
    </form>
  );
}
