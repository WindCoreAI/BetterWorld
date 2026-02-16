"use client";

/**
 * FollowButton Component (Sprint 16: Social Fabric Foundation)
 *
 * Toggle between "Follow" and "Following" states with loading and error handling.
 */
import { useFollows } from "../../hooks/useFollows";
import { Button } from "../ui";

interface FollowButtonProps {
  targetHumanId: string;
  compact?: boolean;
}

export function FollowButton({ targetHumanId, compact = false }: FollowButtonProps) {
  const {
    isFollowing,
    follow,
    unfollow,
    isFollowPending,
    isUnfollowPending,
    statusLoading,
    followError,
  } = useFollows(targetHumanId);

  const isPending = isFollowPending || isUnfollowPending;

  const handleClick = () => {
    if (isPending) return;
    if (isFollowing) {
      unfollow(targetHumanId);
    } else {
      follow(targetHumanId);
    }
  };

  if (statusLoading) {
    return (
      <Button
        variant="secondary"
        size={compact ? "sm" : "md"}
        disabled
        loading
      >
        ...
      </Button>
    );
  }

  // Extract error message for follow limit
  const errorMessage = followError
    ? (followError as Error).message
    : null;
  const isLimitError = errorMessage?.includes("FOLLOW_LIMIT_REACHED");

  return (
    <div>
      <Button
        variant={isFollowing ? "secondary" : "primary"}
        size={compact ? "sm" : "md"}
        onClick={handleClick}
        loading={isPending}
        disabled={isPending || isLimitError}
        aria-label={isFollowing ? "Unfollow" : "Follow"}
      >
        {isFollowing ? "Following" : "Follow"}
      </Button>
      {isLimitError && (
        <p className="text-xs text-error mt-1">
          You&apos;ve reached the 200 follow limit
        </p>
      )}
    </div>
  );
}
