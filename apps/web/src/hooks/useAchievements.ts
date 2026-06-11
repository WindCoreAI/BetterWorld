"use client";

/**
 * useAchievements Hook (Sprint 18: Cooperative Depth & Governance — US10)
 *
 * React Query hooks for cooperative achievements: public browse + mine.
 */
import { useQuery } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { achievementsApi } from "../lib/humanApi";

export function useCooperativeAchievements() {
  return useQuery({
    queryKey: ["achievements", "cooperative"],
    queryFn: () => achievementsApi.list(),
    staleTime: 60_000,
  });
}

export function useMyAchievements() {
  return useQuery({
    queryKey: ["achievements", "mine"],
    queryFn: () => achievementsApi.listMine(),
    enabled: !!getHumanToken(),
    staleTime: 60_000,
  });
}
