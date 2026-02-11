"use client";

const TIER_COLORS: Record<string, string> = {
  newcomer: "bg-gray-100 text-gray-700",
  contributor: "bg-blue-100 text-blue-700",
  advocate: "bg-green-100 text-green-700",
  leader: "bg-purple-100 text-purple-700",
  champion: "bg-amber-100 text-amber-700",
};

interface TierBadgeProps {
  tier: string;
  size?: "sm" | "md" | "lg";
}

export function TierBadge({ tier, size = "md" }: TierBadgeProps) {
  const colorClass = TIER_COLORS[tier] ?? "bg-gray-100 text-gray-700";
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : size === "lg" ? "text-sm px-3 py-1.5" : "text-xs px-2.5 py-1";

  return (
    <span className={`inline-flex items-center rounded-full font-medium capitalize ${colorClass} ${sizeClass}`}>
      {tier}
    </span>
  );
}
