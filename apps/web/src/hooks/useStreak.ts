"use client";

import { useQuery } from "@tanstack/react-query";

import { API_BASE, getHumanToken } from "../lib/api";

export function useStreak() {
  return useQuery({
    queryKey: ["streak", "me"],
    queryFn: async () => {
      const token = getHumanToken();
      const res = await fetch(`${API_BASE}/api/v1/streaks/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    enabled: !!getHumanToken(),
  });
}
