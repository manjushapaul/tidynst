import Link from "next/link";
import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "relative z-0 inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium transition-[color,border-color] duration-[800ms] ease-(--ease-gentle) before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:origin-right before:scale-x-0 before:transition-[scale] before:duration-[800ms] before:ease-(--ease-gentle) hover:before:origin-left hover:before:scale-x-100 focus-visible:before:origin-left focus-visible:before:scale-x-100 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-oak text-white before:bg-oak-deep",
  secondary:
    "border border-line-strong bg-surface text-ink before:bg-[#e3cba6] hover:border-[#e3cba6] hover:text-oak-deep focus-visible:border-[#e3cba6] focus-visible:text-oak-deep",
  ghost: "text-ink before:bg-oak-pale",
  danger: "bg-danger text-white before:bg-danger/90",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-[calc(0.95rem*var(--text-scale))]",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

/** Two-layer wave. The crest is #f1e6d4 and the base is #e3cba6. */
export function ButtonWave() {
  return (
    <span aria-hidden="true" className="cta-ocean">
      <span className="cta-wave" />
      <span className="cta-wave" />
    </span>
  );
}

export const waveButtonClass = "before:hidden border border-[#e3cba6] text-ink!";

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; ripple?: boolean };

export function Button({ variant, size, className, type = "button", ripple = false, children, ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, cn(className, ripple && waveButtonClass))} {...props}>
      {ripple ? <ButtonWave /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  /** Two-layer wave background. Used by the home hero call to action. */
  ripple?: boolean;
};

export function ButtonLink({ variant, size, className, ripple = false, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, cn(className, ripple && waveButtonClass))} {...props}>
      {ripple ? <ButtonWave /> : null}
      {children}
    </Link>
  );
}
