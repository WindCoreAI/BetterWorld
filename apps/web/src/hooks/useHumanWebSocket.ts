"use client";

/**
 * Human WebSocket Connection Hook (Sprint 16: Social Fabric Foundation)
 *
 * Establishes WebSocket connection with human auth token on mount,
 * handles reconnection with exponential backoff, provides subscribe/unsubscribe
 * API for notification events, integrates with React Query cache invalidation.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { getHumanToken } from "../lib/api";

type EventHandler = (data: unknown) => void;

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

export function useHumanWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    const token = getHumanToken();
    if (!token) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS_BASE}/ws/human?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Respond to pings
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        // Dispatch to subscribers
        const handlers = subscribersRef.current.get(message.type);
        if (handlers) {
          for (const handler of handlers) {
            handler(message.data);
          }
        }

        // Invalidate React Query cache for notifications
        if (message.type === "notification") {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["unread-count"] });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      // Normal close (component unmount / page navigation) — don't reconnect
      if (event.code === 1000) return;

      // Exponential backoff reconnection
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current),
        MAX_RECONNECT_DELAY,
      );
      reconnectAttemptRef.current++;

      reconnectTimerRef.current = setTimeout(() => {
        const currentToken = getHumanToken();
        if (currentToken) {
          connect();
        }
      }, delay);
    };

    ws.onerror = () => {
      // Will trigger onclose which handles reconnection
    };
  }, [queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "cleanup");
      }
    };
  }, [connect]);

  const subscribe = useCallback((eventType: string, handler: EventHandler) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set());
    }
    subscribersRef.current.get(eventType)!.add(handler);
  }, []);

  const unsubscribe = useCallback((eventType: string, handler: EventHandler) => {
    const handlers = subscribersRef.current.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }, []);

  return { subscribe, unsubscribe };
}
