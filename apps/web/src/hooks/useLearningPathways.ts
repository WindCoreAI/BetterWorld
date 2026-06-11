"use client";

/**
 * useLearningPathways Hook (Sprint 18: Cooperative Depth & Governance — US6)
 *
 * React Query hooks for learning pathway operations: enrollment,
 * my pathways, per-domain progress, mark case study read.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { learningPathwaysApi } from "../lib/humanApi";

export function useMyPathways() {
  return useQuery({
    queryKey: ["learning-pathways", "me"],
    queryFn: () => learningPathwaysApi.listMine(),
    enabled: !!getHumanToken(),
    staleTime: 30_000,
  });
}

export function usePathwayProgress(domain: string | undefined) {
  return useQuery({
    queryKey: ["learning-pathways", "progress", domain],
    queryFn: () => learningPathwaysApi.getProgress(domain!),
    enabled: !!domain && !!getHumanToken(),
    staleTime: 30_000,
    retry: false, // NOT_ENROLLED is not transient; don't retry
  });
}

export function usePathwayMutations() {
  const queryClient = useQueryClient();

  const enrollMutation = useMutation({
    mutationFn: (domain: string) => learningPathwaysApi.enroll(domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-pathways"] });
    },
  });

  const markCaseStudyReadMutation = useMutation({
    mutationFn: ({ domain, caseStudyId }: { domain: string; caseStudyId: string }) =>
      learningPathwaysApi.markCaseStudyRead(domain, caseStudyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-pathways"] });
    },
  });

  return {
    enroll: enrollMutation,
    markCaseStudyRead: markCaseStudyReadMutation,
  };
}
