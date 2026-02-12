"use client";

/**
 * ValidatorTierBadge Component (Sprint 11 — T047)
 *
 * Displays validator tier as colored badge.
 */

interface ValidatorTierBadgeProps {
  tier: string;
  size?: "sm" | "md" | "lg";
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  apprentice: { bg: "bg-gray-100", text: "text-gray-700", label: "Apprentice" },
  journeyman: { bg: "bg-blue-100", text: "text-blue-700", label: "Journeyman" },
  expert: { bg: "bg-amber-100", text: "text-amber-700", label: "Expert" },
};

const SIZE_STYLES: Record<string, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export default function ValidatorTierBadge({ tier, size = "md" }: ValidatorTierBadgeProps) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.apprentice!;
  const sizeStyle = SIZE_STYLES[size] ?? SIZE_STYLES.md;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${sizeStyle}`}
    >
      {style.label}
    </span>
  );
}
