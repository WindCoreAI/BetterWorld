"use client";

/**
 * useImpact Hook (Sprint 16: Social Fabric Foundation)
 *
 * React Query hook for impact chain visualization and personal ripple summary.
 */
import { useQuery } from "@tanstack/react-query";

import { impactApi } from "../lib/humanApi";

export function useImpactChain(problemId: string) {
  return useQuery({
    queryKey: ["impact-chain", problemId],
    queryFn: () => impactApi.getChain(problemId),
    staleTime: 120_000, // 2 minutes
    enabled: !!problemId,
  });
}

export function useMyRipple() {
  return useQuery({
    queryKey: ["my-ripple"],
    queryFn: () => impactApi.getMyRipple(),
    staleTime: 60_000,
  });
}
