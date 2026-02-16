"use client";

/**
 * ContributorIdentity Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Displays tier badge, specializations, streak days, and specialist indicator.
 * Gracefully handles missing fields.
 */

interface ContributorIdentityProps {
  displayName: string;
  tier?: string;
  specializations?: string[];
  streakDays?: number;
  isSpecialist?: boolean;
  compact?: boolean;
}

const TIER_COLORS: Record<string, string> = {
  newcomer: "bg-gray-100 text-gray-600",
  contributor: "bg-blue-100 text-blue-700",
  advocate: "bg-purple-100 text-purple-700",
  leader: "bg-amber-100 text-amber-700",
  champion: "bg-red-100 text-red-700",
  apprentice: "bg-gray-100 text-gray-600",
  journeyman: "bg-blue-100 text-blue-700",
  expert: "bg-purple-100 text-purple-700",
  master: "bg-amber-100 text-amber-700",
};

export function ContributorIdentity({
  displayName,
  tier,
  specializations,
  streakDays,
  isSpecialist,
  compact = false,
}: ContributorIdentityProps) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
      <span className="font-medium text-gray-900">{displayName}</span>

      {tier && (
        <span
          className={`px-1.5 py-0.5 rounded text-xs ${TIER_COLORS[tier] ?? "bg-gray-100 text-gray-600"}`}
        >
          {tier}
        </span>
      )}

      {isSpecialist && (
        <span className="text-xs text-amber-600 font-medium">Specialist</span>
      )}

      {specializations && specializations.length > 0 && !compact && (
        <span className="text-xs text-gray-400">
          {specializations.slice(0, 3).map((s) => s.replace(/_/g, " ")).join(", ")}
        </span>
      )}

      {streakDays !== undefined && streakDays > 0 && (
        <span className="text-xs text-orange-500">{streakDays}d streak</span>
      )}
    </div>
  );
}
