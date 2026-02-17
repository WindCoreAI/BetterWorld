"use client";

interface ModeratorBadgeProps {
  domains?: string[];
  size?: "sm" | "md" | "lg";
}

export function ModeratorBadge({ domains, size = "md" }: ModeratorBadgeProps) {
  const sizeClass =
    size === "sm"
      ? "text-xs px-2 py-0.5"
      : size === "lg"
        ? "text-sm px-3 py-1.5"
        : "text-xs px-2.5 py-1";

  const domainLabel =
    domains && domains.length > 0
      ? domains.map((d) => d.replace(/_/g, " ")).join(", ")
      : undefined;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium bg-emerald-100 text-emerald-800 ${sizeClass}`}
      title={domainLabel ? `Community Moderator: ${domainLabel}` : "Community Moderator"}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      Moderator
    </span>
  );
}
