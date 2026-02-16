"use client";

/**
 * DomainContributors Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Top contributors list with tier badge and reputation score.
 */
import { Card } from "../ui";

interface Contributor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  reputationScore: number;
  type: "human" | "agent";
}

interface DomainContributorsProps {
  contributors: Contributor[];
}

const TIER_COLORS: Record<string, string> = {
  newcomer: "bg-gray-100 text-gray-700",
  contributor: "bg-blue-100 text-blue-700",
  advocate: "bg-purple-100 text-purple-700",
  leader: "bg-amber-100 text-amber-700",
  champion: "bg-red-100 text-red-700",
};

export function DomainContributors({ contributors }: DomainContributorsProps) {
  if (contributors.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">Top Contributors</h3>
        <p className="text-gray-500 text-sm">No contributors yet. Be the first to join this domain!</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-3">Top Contributors</h3>
      <ul className="space-y-3">
        {contributors.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-400 w-5">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-900 truncate block">{c.displayName}</span>
              <span className="text-xs text-gray-500">{c.reputationScore} pts</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[c.tier] ?? "bg-gray-100 text-gray-700"}`}>
              {c.tier}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
