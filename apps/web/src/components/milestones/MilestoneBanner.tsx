"use client";

/**
 * MilestoneBanner Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Celebration banner for recently reached milestones.
 * Auto-hides after banner period expires.
 */
interface MilestoneBannerProps {
  milestones: Array<{
    id: string;
    milestoneType: string;
    targetValue: number;
    currentValue: number;
    reachedAt: string | null;
    bannerExpiresAt: string | null;
  }>;
}

export function MilestoneBanner({ milestones }: MilestoneBannerProps) {
  const activeBanners = milestones.filter((m) => {
    if (!m.bannerExpiresAt) return false;
    return new Date(m.bannerExpiresAt) > new Date();
  });

  if (activeBanners.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {activeBanners.map((m) => {
        const daysRemaining = Math.max(
          0,
          Math.ceil((new Date(m.bannerExpiresAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );

        return (
          <div
            key={m.id}
            className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3"
          >
            <span className="text-2xl">&#127942;</span>
            <div className="flex-1">
              <span className="font-semibold text-amber-900">
                Milestone Reached: {m.targetValue} {m.milestoneType.replace(/_/g, " ")}!
              </span>
              <span className="text-xs text-amber-600 ml-2">
                {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
