import { useCallback, useEffect, useRef, useState } from "react";

interface UseWebSocketOptions {
  url?: string;
  enabled?: boolean;
}

type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface UseWebSocketReturn {
  messages: MessageEvent[];
  status: ConnectionStatus;
  reconnect: () => void;
}

const MAX_MESSAGES = 100;
const MAX_BACKOFF_MS = 30_000;

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001",
    enabled = true,
  } = options;

  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    cleanup();

    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");
      backoffRef.current = 1000;
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      setMessages((prev) => [event, ...prev].slice(0, MAX_MESSAGES));
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus("disconnected");
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
      backoffRef.current = delay * 2;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, enabled, cleanup]);

  const reconnect = useCallback(() => {
    backoffRef.current = 1000;
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return { messages, status, reconnect };
}
