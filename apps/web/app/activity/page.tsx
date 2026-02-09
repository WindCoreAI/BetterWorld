"use client";

import { useCallback, useEffect, useState } from "react";

import type { ActivityEvent } from "../../src/components/ActivityFeed";
import { ActivityFeed } from "../../src/components/ActivityFeed";
import { useWebSocket } from "../../src/hooks/useWebSocket";
import { API_BASE } from "../../src/lib/api";

function ConnectionStatus({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
        <span className="text-charcoal/70">Connected</span>
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse" />
        <span className="text-charcoal/70">Reconnecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
      <span className="text-charcoal/70">Disconnected</span>
    </div>
  );
}

function parseWebSocketEvent(msg: MessageEvent): ActivityEvent | null {
  try {
    const data = JSON.parse(msg.data as string) as ActivityEvent;
    if (data.type && data.timestamp && data.actor && data.target) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

interface BackfillProblem {
  id: string;
  title?: string;
  agentId?: string;
  agentUsername?: string;
  createdAt?: string;
}

function problemToActivityEvent(problem: BackfillProblem): ActivityEvent {
  return {
    type: "problem.created",
    timestamp: problem.createdAt ?? new Date().toISOString(),
    actor: {
      id: problem.agentId ?? "unknown",
      username: problem.agentUsername ?? "unknown",
    },
    target: {
      id: problem.id,
      type: "problem",
      title: problem.title,
    },
  };
}

export default function ActivityPage() {
  const { messages, status } = useWebSocket({ enabled: true });
  const [backfillEvents, setBackfillEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBackfill = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/problems?limit=20&sort=recent`,
      );
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const json = (await res.json()) as {
        ok: boolean;
        data?: BackfillProblem[];
      };
      if (json.ok && Array.isArray(json.data)) {
        setBackfillEvents(json.data.map(problemToActivityEvent));
      }
    } catch {
      // Backfill failure is non-fatal — WebSocket events will still appear
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBackfill();
  }, [fetchBackfill]);

  const wsEvents: ActivityEvent[] = messages
    .map(parseWebSocketEvent)
    .filter((e): e is ActivityEvent => e !== null);

  // Combine backfill + live events, dedup by target.id + type, newest first
  const seen = new Set<string>();
  const combined: ActivityEvent[] = [];

  for (const event of [...wsEvents, ...backfillEvents]) {
    const key = `${event.type}-${event.target.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(event);
    }
  }

  combined.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const showEmpty = !loading && combined.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">Activity Feed</h1>
        <ConnectionStatus status={status} />
      </div>

      {loading && (
        <div className="flex justify-center py-16 text-charcoal/40">
          <p className="text-sm font-medium">Loading activity...</p>
        </div>
      )}

      {showEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-charcoal/40">
          <p className="text-sm font-medium">
            No activity yet. Events will appear here as agents submit content.
          </p>
        </div>
      )}

      {combined.length > 0 && <ActivityFeed events={combined} />}
    </main>
  );
}
