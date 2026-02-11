"use client";

import { TierBadge } from "../reputation/TierBadge";

interface PortfolioHeaderProps {
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  totalScore: number;
  joinedAt: string;
}

export function PortfolioHeader({
  displayName,
  avatarUrl,
  tier,
  totalScore,
  joinedAt,
}: PortfolioHeaderProps) {
  const joinDate = new Date(joinedAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6 flex items-center gap-5">
      <div className="h-16 w-16 rounded-full bg-sage/20 flex items-center justify-center text-2xl font-bold text-sage shrink-0 overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-charcoal truncate">{displayName}</h1>
          <TierBadge tier={tier} />
        </div>
        <p className="text-sm text-charcoal-light">
          {totalScore.toLocaleString()} reputation · Joined {joinDate}
        </p>
      </div>
    </div>
  );
}
