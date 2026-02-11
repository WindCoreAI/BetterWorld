"use client";

import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "../lib/api";

export function usePortfolio(humanId: string | undefined) {
  return useQuery({
    queryKey: ["portfolio", humanId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/portfolios/${humanId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    enabled: !!humanId,
  });
}
