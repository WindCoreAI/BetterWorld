"use client";

/**
 * Feedback Hooks (Sprint 17: Community Identity & Visible Growth)
 *
 * React Query hooks for feedback inbox, mark-read, and unread count.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { API_BASE, getHumanToken } from "../lib/api";

async function fetchWithAuth(url: string) {
  const token = getHumanToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useFeedbackList(options?: {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
}) {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.unreadOnly) params.set("unreadOnly", "true");
  if (options?.type) params.set("type", options.type);

  const queryString = params.toString();
  const url = `${API_BASE}/api/v1/feedback${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["feedback", "list", options],
    queryFn: () => fetchWithAuth(url),
    staleTime: 60_000,
    enabled: !!getHumanToken(),
  });
}

export function useFeedbackUnreadCount() {
  return useQuery({
    queryKey: ["feedback", "unread-count"],
    queryFn: () => fetchWithAuth(`${API_BASE}/api/v1/feedback/unread-count`),
    staleTime: 60_000,
    enabled: !!getHumanToken(),
  });
}

export function useMarkFeedbackRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedbackId: string) => {
      const token = getHumanToken();
      const res = await fetch(`${API_BASE}/api/v1/feedback/${feedbackId}/read`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
}
