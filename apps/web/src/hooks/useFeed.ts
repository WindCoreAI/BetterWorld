"use client";

/**
 * useFeed Hook (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Cursor-paginated personalized activity feed via React Query
 * infinite query. Events from followed humans are boosted server-side.
 */
import { useInfiniteQuery } from "@tanstack/react-query";

import { getHumanToken } from "../lib/api";
import { feedApi } from "../lib/humanApi";

interface FeedPage {
  ok: boolean;
  data?: {
    items: Array<{
      id: string;
      eventType: string;
      actorHumanId: string | null;
      actorName: string | null;
      targetId: string | null;
      targetType: string;
      domain: string | null;
      city: string | null;
      createdAt: string;
    }>;
    nextCursor: string | null;
  };
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: async ({ pageParam }) => {
      const res = await feedApi.get(pageParam || undefined);
      return res as FeedPage;
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) =>
      lastPage.ok ? lastPage.data?.nextCursor ?? undefined : undefined,
    enabled: !!getHumanToken(),
    staleTime: 30_000,
  });
}
