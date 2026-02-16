"use client";

/**
 * useNetwork Hook (Sprint 16: Social Fabric Foundation)
 *
 * React Query hook for personal network summary and interaction history.
 */
import { useQuery } from "@tanstack/react-query";

import { networkApi } from "../lib/humanApi";

export function useNetworkSummary() {
  return useQuery({
    queryKey: ["network-summary"],
    queryFn: () => networkApi.getSummary(),
    staleTime: 60_000, // 1 minute
  });
}

export function useInteractionHistory(partnerId: string) {
  return useQuery({
    queryKey: ["interaction-history", partnerId],
    queryFn: () => networkApi.getInteractionHistory(partnerId),
    staleTime: 60_000,
    enabled: !!partnerId,
  });
}
