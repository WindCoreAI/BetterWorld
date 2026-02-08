import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-terracotta text-white shadow-neu-sm hover:bg-terracotta-light active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1)] active:translate-y-px",
  secondary:
    "bg-cream text-charcoal border border-charcoal/10 shadow-neu-sm hover:bg-cream-dark active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.06)] active:translate-y-px",
  ghost: "bg-transparent text-terracotta hover:bg-terracotta/5 active:bg-terracotta/10",
  danger:
    "bg-error text-white shadow-neu-sm hover:bg-error/90 active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1)] active:translate-y-px",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg",
  md: "h-10 px-4 text-[15px] rounded-lg",
  lg: "h-12 px-6 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, disabled, className = "", children, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        className={[
          "inline-flex items-center justify-center gap-2 font-semibold",
          "transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-terracotta/30",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {loading && <span className="sr-only">Loading</span>}
        <span className={loading ? "sr-only" : ""}>{children}</span>
      </button>
    );
  },
);
Button.displayName = "Button";
