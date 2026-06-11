"use client";

/**
 * useCaseStudies Hook (Sprint 18: Cooperative Depth & Governance — US7)
 *
 * React Query hooks for the public case study library.
 */
import { useQuery } from "@tanstack/react-query";

import { caseStudiesApi } from "../lib/humanApi";

export function useCaseStudies(domain?: string) {
  return useQuery({
    queryKey: ["case-studies", domain ?? "all"],
    queryFn: () => caseStudiesApi.list(domain || undefined),
    staleTime: 60_000,
  });
}

export function useCaseStudy(id: string | undefined) {
  return useQuery({
    queryKey: ["case-study", id],
    queryFn: () => caseStudiesApi.get(id!),
    enabled: !!id,
    staleTime: 60_000,
    retry: false, // NOT_FOUND is not transient; don't retry
  });
}
