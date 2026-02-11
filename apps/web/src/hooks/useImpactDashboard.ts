"use client";

import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "../lib/api";

export function useImpactDashboard() {
  return useQuery({
    queryKey: ["impact", "dashboard"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/impact/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useImpactHeatmap(params: { domain?: string; period?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.domain) searchParams.set("domain", params.domain);
  if (params.period) searchParams.set("period", params.period);

  const queryString = searchParams.toString();
  const url = `${API_BASE}/api/v1/impact/heatmap${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["impact", "heatmap", params],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 120_000,
  });
}
