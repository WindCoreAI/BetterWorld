"use client";

/**
 * Intelligence Hooks (Sprint 17: Community Identity & Visible Growth)
 *
 * React Query hooks for community intelligence reports.
 */
import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "../lib/api";

async function fetchPublic(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useLatestIntelligence() {
  return useQuery({
    queryKey: ["intelligence", "latest"],
    queryFn: () => fetchPublic(`${API_BASE}/api/v1/intelligence/latest`),
    staleTime: 3_600_000, // 1 hour
  });
}

export function useDomainIntelligence(domain: string | undefined) {
  return useQuery({
    queryKey: ["intelligence", "domain", domain],
    queryFn: () => fetchPublic(`${API_BASE}/api/v1/intelligence/domain/${domain}`),
    staleTime: 3_600_000,
    enabled: !!domain,
  });
}
