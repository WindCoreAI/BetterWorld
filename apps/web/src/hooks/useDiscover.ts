"use client";

/**
 * useDiscover Hook (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * React Query hook for people discovery with domain/city filters.
 */
import { useQuery } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { discoverApi } from "../lib/humanApi";

export function useDiscoverPeople(params?: { domain?: string; city?: string }) {
  return useQuery({
    queryKey: ["discover-people", params],
    queryFn: () => discoverApi.getPeople(params),
    enabled: !!getHumanToken(),
    staleTime: 60_000,
  });
}
