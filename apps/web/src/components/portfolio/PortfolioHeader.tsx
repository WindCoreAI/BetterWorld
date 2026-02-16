"use client";

import { useFollows } from "../../hooks/useFollows";
import { useHumanAuth } from "../../hooks/useHumanAuth";
import { TierBadge } from "../reputation/TierBadge";
import { ConnectButton } from "../social/ConnectButton";
import { FollowButton } from "../social/FollowButton";

interface PortfolioHeaderProps {
  humanId: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  totalScore: number;
  joinedAt: string;
}

export function PortfolioHeader({
  humanId,
  displayName,
  avatarUrl,
  tier,
  totalScore,
  joinedAt,
}: PortfolioHeaderProps) {
  const { user } = useHumanAuth();
  const { followersCount, followingCount, countsLoading } = useFollows(humanId);
  const isOwner = user?.id === humanId;

  const joinDate = new Date(joinedAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6">
      <div className="flex items-center gap-5">
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
          {/* Follow counts */}
          <div className="flex items-center gap-4 mt-2">
            {!countsLoading && (
              <>
                <span className="text-sm text-charcoal">
                  <span className="font-semibold">{followersCount}</span>{" "}
                  <span className="text-charcoal-light">followers</span>
                </span>
                <span className="text-sm text-charcoal">
                  <span className="font-semibold">{followingCount}</span>{" "}
                  <span className="text-charcoal-light">following</span>
                </span>
              </>
            )}
          </div>
        </div>
        {/* Social buttons (not shown for own profile) */}
        {!isOwner && user && (
          <div className="flex-shrink-0 flex flex-col gap-2">
            <FollowButton targetHumanId={humanId} />
            <ConnectButton targetHumanId={humanId} />
          </div>
        )}
      </div>
    </div>
  );
}
