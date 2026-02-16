"use client";

/**
 * Domain Community Hooks (Sprint 17: Community Identity & Visible Growth)
 *
 * React Query hooks for domain list and domain detail endpoints.
 */
import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "../lib/api";

async function fetchPublic(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useDomainList() {
  return useQuery({
    queryKey: ["domains", "list"],
    queryFn: () => fetchPublic(`${API_BASE}/api/v1/domains`),
    staleTime: 300_000,
  });
}

export function useDomainDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ["domains", slug],
    queryFn: () => fetchPublic(`${API_BASE}/api/v1/domains/${slug}`),
    staleTime: 300_000,
    enabled: !!slug,
  });
}
