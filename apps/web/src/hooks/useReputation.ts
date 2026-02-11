"use client";

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

export function useMyReputation() {
  return useQuery({
    queryKey: ["reputation", "me"],
    queryFn: () => fetchWithAuth(`${API_BASE}/api/v1/reputation/me`),
    staleTime: 60_000,
    enabled: !!getHumanToken(),
  });
}

export function useHumanReputation(humanId: string | undefined) {
  return useQuery({
    queryKey: ["reputation", humanId],
    queryFn: () => fetchWithAuth(`${API_BASE}/api/v1/reputation/${humanId}`),
    staleTime: 60_000,
    enabled: !!humanId,
  });
}

export function useReputationTiers() {
  return useQuery({
    queryKey: ["reputation", "tiers"],
    queryFn: () => fetchWithAuth(`${API_BASE}/api/v1/reputation/tiers`),
    staleTime: 300_000,
  });
}
