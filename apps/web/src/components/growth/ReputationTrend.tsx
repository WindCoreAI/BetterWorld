"use client";

/**
 * ReputationTrend Component (Sprint 17: Community Identity & Visible Growth)
 *
 * 90-day reputation trend display using a simple bar representation.
 */
import { Card } from "../ui";

interface ReputationTrendProps {
  trend: Array<{ date: string; score: number; tier: string }>;
}

export function ReputationTrend({ trend }: ReputationTrendProps) {
  if (trend.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">Reputation Trend (90 days)</h3>
        <p className="text-gray-500 text-sm">Not enough data yet. Keep contributing!</p>
      </Card>
    );
  }

  const maxScore = Math.max(...trend.map((t) => t.score), 1);
  const latest = trend[trend.length - 1];
  const earliest = trend[0];
  const delta = latest && earliest ? latest.score - earliest.score : 0;

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-2">Reputation Trend (90 days)</h3>
      <div className="flex items-end gap-0.5 h-20 mb-2">
        {trend.map((t, i) => (
          <div
            key={i}
            className="flex-1 bg-blue-400 rounded-t min-w-[2px]"
            style={{ height: `${(t.score / maxScore) * 100}%` }}
            title={`${t.date}: ${t.score} pts (${t.tier})`}
          />
        ))}
      </div>
      <div className="flex justify-between text-sm text-gray-500">
        <span>{earliest?.date}</span>
        <span className={delta >= 0 ? "text-green-600" : "text-red-600"}>
          {delta >= 0 ? "+" : ""}{delta} pts
        </span>
        <span>{latest?.date}</span>
      </div>
    </Card>
  );
}
