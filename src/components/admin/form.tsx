"use client";

import { type ComponentProps, type ReactNode, useId, useLayoutEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ButtonWave, buttonClasses, waveButtonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const inputClasses =
  "block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[calc(0.95rem*var(--text-scale))] text-ink placeholder:text-muted/70 transition-colors focus:border-oak focus:outline-none focus-visible:outline-2 focus-visible:outline-oak aria-invalid:border-danger";

export const fileInputClasses =
  "block w-full cursor-pointer text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line-strong file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-oak-deep hover:file:bg-oak-pale focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oak";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
  className?: string;
};

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type SubmitButtonProps = Omit<ComponentProps<"button">, "type"> & {
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  ripple?: boolean;
};

export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  className,
  disabled,
  ripple = false,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className={buttonClasses(variant, size, cn(className, ripple && waveButtonClass))}
      {...props}
    >
      {ripple ? <ButtonWave /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string | null } | null }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "col-span-full rounded-xl px-4 py-3 text-sm",
        state.ok ? "bg-oak-pale text-oak-deep" : "bg-danger-pale text-danger",
      )}
    >
      {state.message}
    </p>
  );
}

/**
 * React resets a form after its action settles, and a controlled `<select>` falls back to its first
 * option because React never marks a default. Without this the screen, and the next submission,
 * would silently use that first option. Pass the action state so the value is re-applied after each
 * reset.
 */
export function useControlledSelect(value: string, actionState: unknown) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value, actionState]);
  return ref;
}

type ControlledCheckboxProps = Omit<
  ComponentProps<"input">,
  "type" | "checked" | "defaultChecked" | "ref"
> & {
  checked: boolean;
};

/**
 * React records a controlled checkbox's default only when it mounts, so the reset after an action
 * would put it back to that first state while React still holds the current one. Keeping
 * `defaultChecked` in step with `checked` makes that reset a no-op.
 */
export function ControlledCheckbox({ checked, ...props }: ControlledCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.defaultChecked = checked;
    if (input.checked !== checked) input.checked = checked;
  }, [checked]);
  return <input {...props} ref={ref} type="checkbox" checked={checked} />;
}

export function CsrfField({ token }: { token: string }) {
  return <input type="hidden" name="csrf" value={token} />;
}
