"use client";

import { TierBadge } from "../reputation/TierBadge";

interface LeaderboardEntry {
  rank: number;
  humanId: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  tier?: string;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  type?: string;
  loading?: boolean;
}

export function LeaderboardTable({ entries, type, loading }: LeaderboardTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-charcoal/5 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-center text-charcoal-light py-8">No entries yet</p>;
  }

  return (
    <div className="bg-white rounded-xl shadow-neu-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-sm text-charcoal-light">
            <th className="text-left py-3 px-4 w-12">#</th>
            <th className="text-left py-3 px-4">Human</th>
            <th className="text-right py-3 px-4">Score</th>
            {type === "reputation" && <th className="text-right py-3 px-4">Tier</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.humanId} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-3 px-4 text-sm font-medium text-charcoal-light">
                {entry.rank + 1}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-charcoal-light">
                    {entry.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-charcoal">{entry.displayName}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-right text-sm font-semibold text-charcoal">
                {typeof entry.score === "number" ? entry.score.toLocaleString() : entry.score}
              </td>
              {type === "reputation" && (
                <td className="py-3 px-4 text-right">
                  {entry.tier && <TierBadge tier={entry.tier} size="sm" />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
