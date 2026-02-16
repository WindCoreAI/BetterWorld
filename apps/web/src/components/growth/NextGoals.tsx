"use client";

/**
 * NextGoals Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Auto-generated goal cards with progress bars.
 */
import { Card } from "../ui";

interface NextGoalsProps {
  goals: Array<{ type: string; description: string; progressPercent: number }>;
}

const GOAL_ICONS: Record<string, string> = {
  tier_progress: "&#9733;",
  domain_breadth: "&#127760;",
  streak: "&#128293;",
};

export function NextGoals({ goals }: NextGoalsProps) {
  if (goals.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">Next Goals</h3>
        <p className="text-gray-500 text-sm">All goals achieved! Amazing work.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-3">Next Goals</h3>
      <div className="space-y-4">
        {goals.map((g) => (
          <div key={g.type}>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-lg"
                dangerouslySetInnerHTML={{ __html: GOAL_ICONS[g.type] ?? "&#127919;" }}
              />
              <span className="text-sm text-gray-700">{g.description}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${g.progressPercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{g.progressPercent}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
