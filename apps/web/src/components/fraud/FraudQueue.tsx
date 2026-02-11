"use client";

import Link from "next/link";

interface FraudQueueEntry {
  humanId: string;
  displayName: string;
  email: string;
  fraudScore: {
    total: number;
    phash: number;
    velocity: number;
    statistical: number;
  };
  status: string;
  flaggedAt: string | null;
  suspendedAt: string | null;
}

interface FraudQueueProps {
  entries: FraudQueueEntry[];
  loading: boolean;
}

function statusBadge(status: string) {
  switch (status) {
    case "flagged":
      return "bg-amber-100 text-amber-700";
    case "suspended":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function FraudQueue({ entries, loading }: FraudQueueProps) {
  if (loading) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-6">
        <div className="h-8 bg-charcoal/5 rounded animate-pulse mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-charcoal/5 rounded animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-charcoal-light">No flagged accounts in the queue.</p>
      </div>
    );
  }

  return (
    <div className="bg-cream rounded-xl shadow-neu-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-charcoal/10">
            <th className="text-left px-4 py-3 font-medium text-charcoal-light">User</th>
            <th className="text-right px-4 py-3 font-medium text-charcoal-light">Score</th>
            <th className="text-right px-4 py-3 font-medium text-charcoal-light hidden sm:table-cell">pHash</th>
            <th className="text-right px-4 py-3 font-medium text-charcoal-light hidden sm:table-cell">Velocity</th>
            <th className="text-center px-4 py-3 font-medium text-charcoal-light">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.humanId} className="border-b border-charcoal/5 hover:bg-charcoal/5 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-charcoal">{entry.displayName}</p>
                <p className="text-xs text-charcoal-light">{entry.email}</p>
              </td>
              <td className="text-right px-4 py-3 font-mono font-medium text-charcoal">
                {entry.fraudScore.total}
              </td>
              <td className="text-right px-4 py-3 font-mono text-charcoal-light hidden sm:table-cell">
                {entry.fraudScore.phash}
              </td>
              <td className="text-right px-4 py-3 font-mono text-charcoal-light hidden sm:table-cell">
                {entry.fraudScore.velocity}
              </td>
              <td className="text-center px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(entry.status)}`}>
                  {entry.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/fraud/${entry.humanId}`}
                  className="text-xs text-terracotta hover:underline"
                >
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
