"use client";

/**
 * useMentorships Hook (Sprint 18: Cooperative Depth & Governance — US1)
 *
 * React Query hook for mentorship operations: suggestions, create,
 * accept, decline, end, rate, list, detail.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { mentorshipsApi } from "../lib/humanApi";

export function useMentorshipSuggestions() {
  return useQuery({
    queryKey: ["mentorship-suggestions"],
    queryFn: () => mentorshipsApi.getSuggestions(),
    staleTime: 60_000,
  });
}

export function useMentorships(params?: { status?: string; role?: string }) {
  return useQuery({
    queryKey: ["mentorships", params],
    queryFn: () => mentorshipsApi.list(params),
    staleTime: 30_000,
  });
}

export function useMentorshipDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["mentorship", id],
    queryFn: () => mentorshipsApi.getDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useMentorshipMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (mentorHumanId: string) => mentorshipsApi.create(mentorHumanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentorship-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["mentorships"] });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => mentorshipsApi.accept(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentorships"] });
      queryClient.invalidateQueries({ queryKey: ["mentorship"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => mentorshipsApi.decline(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentorships"] });
      queryClient.invalidateQueries({ queryKey: ["mentorship"] });
      queryClient.invalidateQueries({ queryKey: ["mentorship-suggestions"] });
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => mentorshipsApi.end(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentorships"] });
      queryClient.invalidateQueries({ queryKey: ["mentorship"] });
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      mentorshipsApi.rate(id, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentorships"] });
      queryClient.invalidateQueries({ queryKey: ["mentorship"] });
    },
  });

  return {
    create: createMutation,
    accept: acceptMutation,
    decline: declineMutation,
    end: endMutation,
    rate: rateMutation,
  };
}
