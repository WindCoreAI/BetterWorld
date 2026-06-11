"use client";

/**
 * useModerator Hook (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * React Query hooks for the community moderator queue, decisions,
 * and personal review statistics. All endpoints return FORBIDDEN for
 * non-moderators, which pages surface as an access notice.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { moderatorApi } from "../lib/humanApi";

export function useModeratorQueue() {
  return useQuery({
    queryKey: ["moderator-queue"],
    queryFn: () => moderatorApi.getQueue(),
    enabled: !!getHumanToken(),
    staleTime: 15_000,
    retry: false, // FORBIDDEN is not transient; don't retry
  });
}

export function useModeratorStats() {
  return useQuery({
    queryKey: ["moderator-stats"],
    queryFn: () => moderatorApi.getStats(),
    enabled: !!getHumanToken(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useModeratorMutations() {
  const queryClient = useQueryClient();

  const decideMutation = useMutation({
    mutationFn: ({ itemId, decision, reason }: { itemId: string; decision: "approved" | "rejected" | "escalated"; reason?: string }) =>
      moderatorApi.decide(itemId, { decision, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moderator-queue"] });
      queryClient.invalidateQueries({ queryKey: ["moderator-stats"] });
    },
  });

  return { decide: decideMutation };
}
