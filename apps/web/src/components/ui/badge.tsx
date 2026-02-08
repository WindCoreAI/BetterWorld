import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type BadgeVariant = "domain" | "difficulty" | "status" | "reputation";
type BadgeSize = "sm" | "md" | "lg";
type DifficultyLevel = "easy" | "medium" | "hard" | "expert";
type StatusLevel = "pending" | "approved" | "rejected" | "flagged";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  difficulty?: DifficultyLevel;
  status?: StatusLevel;
  children: ReactNode;
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 text-xs",
  md: "h-6 px-2 text-xs",
  lg: "h-7 px-2.5 text-[13px]",
};

const difficultyClasses: Record<DifficultyLevel, string> = {
  easy: "border border-success text-success bg-success/10",
  medium: "border border-warning text-warning bg-warning/10",
  hard: "border border-terracotta text-terracotta bg-terracotta/10",
  expert: "border border-error text-error bg-error/10",
};

const statusClasses: Record<StatusLevel, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-error/15 text-error",
  flagged: "bg-info/15 text-info",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "domain", size = "md", difficulty, status, className = "", children, ...props }, ref) => {
    let variantClass = "bg-terracotta/10 text-terracotta";

    if (variant === "difficulty" && difficulty) {
      variantClass = difficultyClasses[difficulty];
    } else if (variant === "status" && status) {
      variantClass = statusClasses[status];
    } else if (variant === "reputation") {
      variantClass = "bg-gradient-to-r from-terracotta/10 to-terracotta/20 text-terracotta-dark";
    }

    return (
      <span
        ref={ref}
        className={[
          "inline-flex items-center gap-1 font-medium rounded-full",
          sizeClasses[size],
          variantClass,
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";
