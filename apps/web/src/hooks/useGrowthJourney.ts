"use client";

/**
 * Growth Journey Hook (Sprint 17: Community Identity & Visible Growth)
 *
 * React Query hook for the growth journey endpoint.
 */
import { useQuery } from "@tanstack/react-query";

import { API_BASE, getHumanToken } from "../lib/api";

async function fetchWithAuth(url: string) {
  const token = getHumanToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useGrowthJourney() {
  return useQuery({
    queryKey: ["growth", "me"],
    queryFn: () => fetchWithAuth(`${API_BASE}/api/v1/growth/me`),
    staleTime: 300_000,
    enabled: !!getHumanToken(),
  });
}
