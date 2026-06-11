"use client";

/**
 * useTeaching Hook (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * React Query hooks for teaching rewards (points, Teacher badge,
 * public leaderboard) and welcome ambassador stats.
 */
import { useQuery } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { ambassadorApi, teachingApi } from "../lib/humanApi";

export function useTeachingMe() {
  return useQuery({
    queryKey: ["teaching", "me"],
    queryFn: () => teachingApi.getMe(),
    enabled: !!getHumanToken(),
    staleTime: 60_000,
  });
}

export function useTeachingLeaderboard() {
  return useQuery({
    queryKey: ["teaching", "leaderboard"],
    queryFn: () => teachingApi.getLeaderboard(),
    staleTime: 60_000,
  });
}

export function useAmbassadorMe() {
  return useQuery({
    queryKey: ["ambassador", "me"],
    queryFn: () => ambassadorApi.getMe(),
    enabled: !!getHumanToken(),
    staleTime: 60_000,
  });
}
