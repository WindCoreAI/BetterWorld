import type { ReactNode } from "react";

type CalloutType = "info" | "warning" | "tip" | "danger";

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

const STYLES: Record<CalloutType, { border: string; bg: string; icon: string; titleColor: string }> = {
  info: {
    border: "border-info",
    bg: "bg-info/5",
    icon: "\u2139\uFE0F",
    titleColor: "text-info",
  },
  warning: {
    border: "border-warning",
    bg: "bg-warning/5",
    icon: "\u26A0\uFE0F",
    titleColor: "text-warning",
  },
  tip: {
    border: "border-success",
    bg: "bg-success/5",
    icon: "\uD83D\uDCA1",
    titleColor: "text-success",
  },
  danger: {
    border: "border-error",
    bg: "bg-error/5",
    icon: "\uD83D\uDEA8",
    titleColor: "text-error",
  },
};

export function Callout({ type = "info", title, children }: CalloutProps) {
  const style = STYLES[type];
  const displayTitle = title ?? type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <div
      className={`border-l-4 ${style.border} ${style.bg} rounded-r-xl p-4 my-6`}
    >
      <p className={`font-semibold text-sm mb-1 ${style.titleColor}`}>
        {style.icon} {displayTitle}
      </p>
      <div className="text-sm text-charcoal-light leading-relaxed">
        {children}
      </div>
    </div>
  );
}
