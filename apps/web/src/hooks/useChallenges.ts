"use client";

/**
 * useChallenges Hook (Sprint 18: Cooperative Depth & Governance — US8)
 *
 * React Query hooks for cross-group challenges: list, detail with
 * leaderboard, personal progress, and join mutation.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { challengesApi } from "../lib/humanApi";

export function useChallenges() {
  return useQuery({
    queryKey: ["challenges"],
    queryFn: () => challengesApi.list(),
    staleTime: 60_000,
  });
}

export function useChallenge(id: string | undefined) {
  return useQuery({
    queryKey: ["challenge", id],
    queryFn: () => challengesApi.get(id!),
    enabled: !!id,
    staleTime: 30_000,
    retry: false, // NOT_FOUND is not transient; don't retry
  });
}

export function useChallengeProgress(id: string | undefined) {
  return useQuery({
    queryKey: ["challenge-progress", id],
    queryFn: () => challengesApi.getMyProgress(id!),
    enabled: !!id && !!getHumanToken(),
    staleTime: 30_000,
    retry: false, // NOT_JOINED is not transient; don't retry
  });
}

export function useChallengeMutations() {
  const queryClient = useQueryClient();

  const joinMutation = useMutation({
    mutationFn: (id: string) => challengesApi.join(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["challenge", id] });
      queryClient.invalidateQueries({ queryKey: ["challenge-progress", id] });
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
  });

  return { join: joinMutation };
}
