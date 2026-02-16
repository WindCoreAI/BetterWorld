"use client";

/**
 * FollowersList Component (Sprint 16: Social Fabric Foundation)
 *
 * Paginated list of followers/following with user cards, tier badges,
 * city, and "Follow back" indicator.
 */
import Link from "next/link";
import { useState } from "react";

import { useFollowingList, useFollowersList } from "../../hooks/useFollows";
import { Badge, Button } from "../ui";
import { FollowButton } from "./FollowButton";

type Tab = "following" | "followers";

interface FollowersListProps {
  humanId: string;
  initialTab?: Tab;
}

interface FollowUserItem {
  humanId: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  city: string | null;
  followedAt: string;
  isFollowingBack?: boolean;
}

export function FollowersList({ initialTab = "following" }: FollowersListProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [followingCursor, setFollowingCursor] = useState<string | undefined>();
  const [followersCursor, setFollowersCursor] = useState<string | undefined>();

  const followingQuery = useFollowingList({ cursor: followingCursor });
  const followersQuery = useFollowersList({ cursor: followersCursor });

  const activeQuery = activeTab === "following" ? followingQuery : followersQuery;
  const items: FollowUserItem[] = activeQuery.data?.ok ? activeQuery.data.data ?? [] : [];
  const meta = activeQuery.data?.ok ? activeQuery.data.meta : null;

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center gap-3 mb-4">
        <button
          className={`text-sm px-3 py-1 rounded-full ${
            activeTab === "following"
              ? "bg-terracotta text-cream"
              : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
          }`}
          onClick={() => { setActiveTab("following"); setFollowingCursor(undefined); }}
        >
          Following
        </button>
        <button
          className={`text-sm px-3 py-1 rounded-full ${
            activeTab === "followers"
              ? "bg-terracotta text-cream"
              : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
          }`}
          onClick={() => { setActiveTab("followers"); setFollowersCursor(undefined); }}
        >
          Followers
        </button>
      </div>

      {/* Loading state */}
      {activeQuery.isLoading && (
        <div className="text-center py-8 text-charcoal-light">
          Loading...
        </div>
      )}

      {/* Empty state */}
      {!activeQuery.isLoading && items.length === 0 && (
        <div className="text-center py-12 text-charcoal-light">
          <p className="text-lg mb-2">
            {activeTab === "following" ? "Not following anyone yet" : "No followers yet"}
          </p>
          <p className="text-sm">
            {activeTab === "following"
              ? "Follow other participants to keep up with their activity."
              : "Complete missions and engage with the community to gain followers."}
          </p>
        </div>
      )}

      {/* User list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((user) => (
            <div
              key={user.humanId}
              className="flex items-center justify-between p-3 rounded-lg bg-white shadow-neu-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar placeholder */}
                <div className="w-10 h-10 rounded-full bg-charcoal/10 flex items-center justify-center flex-shrink-0">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-charcoal-light">
                      {user.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <Link
                    href={`/portfolios/${user.humanId}`}
                    className="text-sm font-medium text-charcoal hover:text-terracotta truncate block"
                  >
                    {user.displayName}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary">{user.tier}</Badge>
                    {user.city && (
                      <span className="text-xs text-charcoal-light">{user.city}</span>
                    )}
                    {activeTab === "followers" && user.isFollowingBack && (
                      <span className="text-xs text-terracotta font-medium">Follows you back</span>
                    )}
                  </div>
                </div>
              </div>

              <FollowButton targetHumanId={user.humanId} compact />
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {meta?.hasMore && (
        <div className="text-center mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (activeTab === "following") {
                setFollowingCursor(meta.nextCursor ?? undefined);
              } else {
                setFollowersCursor(meta.nextCursor ?? undefined);
              }
            }}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
