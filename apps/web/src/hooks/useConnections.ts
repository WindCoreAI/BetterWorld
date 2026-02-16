"use client";

/**
 * useConnections Hook (Sprint 16: Social Fabric Foundation)
 *
 * React Query hook for connection operations: request, accept, decline,
 * remove, list, pending, suggestions, status.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { connectionsApi } from "../lib/humanApi";

export function useConnections(targetHumanId?: string) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["connection-status", targetHumanId],
    queryFn: () => connectionsApi.getStatus(targetHumanId!),
    enabled: !!targetHumanId,
    staleTime: 30_000,
  });

  const requestMutation = useMutation({
    mutationFn: (humanId: string) => connectionsApi.sendRequest(humanId),
    onSuccess: (_data, humanId) => {
      queryClient.invalidateQueries({ queryKey: ["connection-status", humanId] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections-pending"] });
      queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (connectionId: string) => connectionsApi.accept(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections-pending"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (connectionId: string) => connectionsApi.decline(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections-pending"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (connectionId: string) => connectionsApi.remove(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
    },
  });

  const status = statusQuery.data?.ok ? statusQuery.data.data : null;

  return {
    connectionStatus: status?.status ?? "none",
    connectionId: status?.connectionId ?? null,
    direction: status?.direction ?? null,
    connectedSince: status?.connectedSince ?? null,
    statusLoading: statusQuery.isLoading,

    request: requestMutation.mutate,
    accept: acceptMutation.mutate,
    decline: declineMutation.mutate,
    remove: removeMutation.mutate,

    isRequestPending: requestMutation.isPending,
    isAcceptPending: acceptMutation.isPending,
    isDeclinePending: declineMutation.isPending,
    isRemovePending: removeMutation.isPending,
    requestError: requestMutation.error,
  };
}

export function useConnectionList(options?: { cursor?: string; limit?: number; domain?: string }) {
  return useQuery({
    queryKey: ["connections", options?.cursor, options?.limit, options?.domain],
    queryFn: () => connectionsApi.list(options?.cursor, options?.limit, options?.domain),
    staleTime: 30_000,
  });
}

export function usePendingConnections(options?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: ["connections-pending", options?.cursor, options?.limit],
    queryFn: () => connectionsApi.listPending(options?.cursor, options?.limit),
    staleTime: 30_000,
  });
}

export function useConnectionSuggestions() {
  return useQuery({
    queryKey: ["connection-suggestions"],
    queryFn: () => connectionsApi.getSuggestions(),
    staleTime: 300_000, // 5 minutes to match backend cache
  });
}
