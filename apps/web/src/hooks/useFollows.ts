"use client";

/**
 * useFollows Hook (Sprint 16: Social Fabric Foundation)
 *
 * React Query hook for follow/unfollow, following/followers lists,
 * follow status, and follow counts with optimistic updates.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { followsApi } from "../lib/humanApi";

export function useFollows(targetHumanId?: string) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["follow-status", targetHumanId],
    queryFn: () => followsApi.getStatus(targetHumanId!),
    enabled: !!targetHumanId,
    staleTime: 30_000,
  });

  const countsQuery = useQuery({
    queryKey: ["follow-counts", targetHumanId],
    queryFn: () => followsApi.getCounts(targetHumanId!),
    enabled: !!targetHumanId,
    staleTime: 30_000,
  });

  const followMutation = useMutation({
    mutationFn: (humanId: string) => followsApi.follow(humanId),
    onSuccess: (_data, humanId) => {
      queryClient.invalidateQueries({ queryKey: ["follow-status", humanId] });
      queryClient.invalidateQueries({ queryKey: ["follow-counts", humanId] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (humanId: string) => followsApi.unfollow(humanId),
    onSuccess: (_data, humanId) => {
      queryClient.invalidateQueries({ queryKey: ["follow-status", humanId] });
      queryClient.invalidateQueries({ queryKey: ["follow-counts", humanId] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
    },
  });

  return {
    // Status for a specific user
    isFollowing: statusQuery.data?.ok ? statusQuery.data.data?.isFollowing ?? false : false,
    isFollowedBy: statusQuery.data?.ok ? statusQuery.data.data?.isFollowedBy ?? false : false,
    followingSince: statusQuery.data?.ok ? statusQuery.data.data?.followingSince ?? null : null,
    statusLoading: statusQuery.isLoading,

    // Counts for a specific user
    followersCount: countsQuery.data?.ok ? countsQuery.data.data?.followersCount ?? 0 : 0,
    followingCount: countsQuery.data?.ok ? countsQuery.data.data?.followingCount ?? 0 : 0,
    countsLoading: countsQuery.isLoading,

    // Mutations
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isFollowPending: followMutation.isPending,
    isUnfollowPending: unfollowMutation.isPending,
    followError: followMutation.error,
  };
}

export function useFollowingList(options?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: ["following", options?.cursor, options?.limit],
    queryFn: () => followsApi.getFollowing(options?.cursor, options?.limit),
    staleTime: 30_000,
  });
}

export function useFollowersList(options?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: ["followers", options?.cursor, options?.limit],
    queryFn: () => followsApi.getFollowers(options?.cursor, options?.limit),
    staleTime: 30_000,
  });
}
