"use client";

/**
 * useNotifications Hook (Sprint 16: Social Fabric Foundation)
 *
 * React Query hook for notification list, unread count, mark read, mark all read.
 * Subscribes to WebSocket for real-time updates.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useHumanWebSocket } from "./useHumanWebSocket";
import { notificationsApi } from "../lib/humanApi";

export function useNotifications(options?: {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe } = useHumanWebSocket();

  // Invalidate on WebSocket notification events
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    };
    subscribe("notification", handler);
    return () => unsubscribe("notification", handler);
  }, [subscribe, unsubscribe, queryClient]);

  const listQuery = useQuery({
    queryKey: ["notifications", options?.cursor, options?.limit, options?.unreadOnly, options?.type],
    queryFn: () =>
      notificationsApi.list(
        options?.cursor,
        options?.limit,
        options?.unreadOnly,
        options?.type,
      ),
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  });

  const unreadCountQuery = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => notificationsApi.getUnreadCount(),
    staleTime: 30_000,
    refetchInterval: 60_000, // Poll every minute as fallback
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      notificationsApi.markRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  return {
    notifications: listQuery.data?.ok ? listQuery.data.data : [],
    meta: listQuery.data?.ok ? listQuery.data.meta : null,
    isLoading: listQuery.isLoading,
    unreadCount: unreadCountQuery.data?.ok ? unreadCountQuery.data.data?.unreadCount ?? 0 : 0,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending,
  };
}
