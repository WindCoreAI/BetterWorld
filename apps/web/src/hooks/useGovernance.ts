"use client";

/**
 * useGovernance Hook (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * React Query hooks for public governance transparency metrics:
 * power distribution audit and network health.
 */
import { useQuery } from "@tanstack/react-query";

import { governanceApi } from "../lib/humanApi";

export function usePowerAudit() {
  return useQuery({
    queryKey: ["governance", "power-audit"],
    queryFn: () => governanceApi.getPowerAudit(),
    staleTime: 300_000, // Snapshots are computed weekly; 5 min is plenty fresh
  });
}

export function useNetworkHealth() {
  return useQuery({
    queryKey: ["governance", "network-health"],
    queryFn: () => governanceApi.getNetworkHealth(),
    staleTime: 300_000,
  });
}
