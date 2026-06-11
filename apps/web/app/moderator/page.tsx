"use client";

/**
 * Moderator Page (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * Domain-scoped flagged content queue for community moderators,
 * with approve/reject/escalate decisions (immutable audit trail)
 * and personal review statistics. Non-moderators see an access notice.
 */
import { useEffect, useState } from "react";

import { ModeratorQueue } from "@/components/moderator/ModeratorQueue";
import { useModeratorQueue, useModeratorStats, useModeratorMutations } from "@/hooks/useModerator";
import { getHumanToken } from "@/lib/api";

interface ModeratorStats {
  totalActions: number;
  approvedCount: number;
  rejectedCount: number;
  escalatedCount: number;
}

function StatsRow({ stats }: { stats: ModeratorStats }) {
  const cells = [
    { label: "Total Reviews", value: stats.totalActions },
    { label: "Approved", value: stats.approvedCount },
    { label: "Rejected", value: stats.rejectedCount },
    { label: "Escalated", value: stats.escalatedCount },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">{cell.label}</p>
          <p className="text-lg font-bold">{cell.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function ModeratorPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const queueQuery = useModeratorQueue();
  const statsQuery = useModeratorStats();
  const { decide } = useModeratorMutations();

  const isLoggedIn = isMounted && !!getHumanToken();

  const queueResponse = queueQuery.data;
  const forbidden = (() => {
    if (!queueResponse || queueResponse.ok) return false;
    const code = (queueResponse as { error?: { code?: string } | string }).error;
    return (typeof code === "string" ? code : code?.code) === "FORBIDDEN";
  })();

  const items = queueResponse?.ok ? queueResponse.data?.items ?? [] : [];
  const stats: ModeratorStats | null = statsQuery.data?.ok
    ? (statsQuery.data.data as ModeratorStats)
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Moderation Queue</h1>
      <p className="text-gray-600 mb-6">
        Review flagged content in your moderator domains. Every decision is
        recorded in an immutable audit trail.
      </p>

      {isMounted && !isLoggedIn && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to access moderation tools.
        </div>
      )}

      {isLoggedIn && forbidden && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-sm text-yellow-800">
          <p className="font-medium mb-1">Moderator access required</p>
          <p>
            Community moderators are champion-tier contributors appointed per domain.
            Keep contributing and reviewing — eligible members are invited automatically.
          </p>
        </div>
      )}

      {isLoggedIn && !forbidden && (
        <>
          {stats && <StatsRow stats={stats} />}

          {decide.isError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Decision could not be saved. Please try again.
            </div>
          )}

          {queueQuery.isLoading ? (
            <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
              Loading queue...
            </div>
          ) : (
            <ModeratorQueue
              items={items}
              onDecide={(itemId, decision, reason) =>
                decide.mutate({ itemId, decision, reason })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
