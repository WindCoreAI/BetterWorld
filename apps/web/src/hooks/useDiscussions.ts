"use client";

/**
 * useDiscussions Hook (Sprint 16: Social Fabric Foundation)
 *
 * React Query hook for discussion threads and replies.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { discussionsApi } from "../lib/humanApi";

export function useThreadList(scopeType: string, scopeValue: string, options?: {
  cursor?: string;
  limit?: number;
  sort?: string;
}) {
  return useQuery({
    queryKey: ["discussion-threads", scopeType, scopeValue, options?.cursor, options?.sort],
    queryFn: () => discussionsApi.listThreads(scopeType, scopeValue, options?.cursor, options?.limit, options?.sort),
    staleTime: 30_000,
    enabled: !!scopeType && !!scopeValue,
  });
}

export function useThread(threadId: string) {
  return useQuery({
    queryKey: ["discussion-thread", threadId],
    queryFn: () => discussionsApi.getThread(threadId),
    staleTime: 30_000,
    enabled: !!threadId,
  });
}

export function useReplyList(threadId: string, options?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: ["discussion-replies", threadId, options?.cursor],
    queryFn: () => discussionsApi.listReplies(threadId, options?.cursor, options?.limit),
    staleTime: 30_000,
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { scopeType: string; scopeValue: string; title: string; content: string }) =>
      discussionsApi.createThread(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["discussion-threads", variables.scopeType, variables.scopeValue],
      });
    },
  });
}

export function useCreateReply(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => discussionsApi.createReply(threadId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discussion-replies", threadId] });
      queryClient.invalidateQueries({ queryKey: ["discussion-thread", threadId] });
    },
  });
}
