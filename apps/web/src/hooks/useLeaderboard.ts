"use client";

import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "../lib/api";

export function useLeaderboard(
  type: string,
  params: { period?: string; domain?: string; cursor?: string; limit?: number } = {},
) {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set("period", params.period);
  if (params.domain) searchParams.set("domain", params.domain);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const url = `${API_BASE}/api/v1/leaderboards/${type}${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["leaderboard", type, params],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}
