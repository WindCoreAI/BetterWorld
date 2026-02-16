"use client";

/**
 * DomainHighlights Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Monthly highlights summary for a domain community.
 */
import { Card } from "../ui";

interface DomainHighlightsProps {
  highlights: {
    month: string;
    missionsCompletedThisMonth: number;
    problemsResolvedThisMonth: number;
    newMembersThisMonth: number;
    topPattern: string | null;
  };
}

export function DomainHighlights({ highlights }: DomainHighlightsProps) {
  const hasActivity =
    highlights.missionsCompletedThisMonth > 0 ||
    highlights.problemsResolvedThisMonth > 0 ||
    highlights.newMembersThisMonth > 0;

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-2">
        Monthly Highlights ({highlights.month})
      </h3>
      {!hasActivity ? (
        <p className="text-gray-500 text-sm">No activity recorded this month yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <span className="text-xl font-bold text-green-600">
              {highlights.missionsCompletedThisMonth}
            </span>
            <span className="block text-xs text-gray-500">Missions Completed</span>
          </div>
          <div>
            <span className="text-xl font-bold text-blue-600">
              {highlights.problemsResolvedThisMonth}
            </span>
            <span className="block text-xs text-gray-500">Problems Resolved</span>
          </div>
          <div>
            <span className="text-xl font-bold text-purple-600">
              {highlights.newMembersThisMonth}
            </span>
            <span className="block text-xs text-gray-500">New Members</span>
          </div>
        </div>
      )}
      {highlights.topPattern && (
        <p className="text-sm text-gray-600 mt-3">
          Top Pattern: <span className="font-medium">{highlights.topPattern}</span>
        </p>
      )}
    </Card>
  );
}
