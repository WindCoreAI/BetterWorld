"use client";

/**
 * useCircles Hook (Sprint 18: Cooperative Depth & Governance — US9)
 *
 * React Query hooks for community circles: browse, detail, posts,
 * shared missions, and create/join/leave/post mutations.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { circlesApi } from "../lib/humanApi";

export function useCircles(domain?: string) {
  return useQuery({
    queryKey: ["circles", domain ?? "all"],
    queryFn: () => circlesApi.list(domain || undefined),
    staleTime: 30_000,
  });
}

export function useCircle(id: string | undefined) {
  return useQuery({
    queryKey: ["circle", id],
    queryFn: () => circlesApi.get(id!),
    enabled: !!id,
    staleTime: 30_000,
    retry: false, // NOT_FOUND is not transient; don't retry
  });
}

export function useCirclePosts(id: string | undefined) {
  return useQuery({
    queryKey: ["circle-posts", id],
    queryFn: () => circlesApi.getPosts(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCircleMissions(id: string | undefined) {
  return useQuery({
    queryKey: ["circle-missions", id],
    queryFn: () => circlesApi.getMissions(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCircleMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; domain?: string }) =>
      circlesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => circlesApi.join(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["circle", id] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: (id: string) => circlesApi.leave(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["circle", id] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      circlesApi.createPost(id, { content }),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["circle-posts", id] });
    },
  });

  return {
    create: createMutation,
    join: joinMutation,
    leave: leaveMutation,
    createPost: createPostMutation,
  };
}
