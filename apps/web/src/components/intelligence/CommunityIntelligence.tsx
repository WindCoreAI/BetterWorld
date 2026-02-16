"use client";

/**
 * CommunityIntelligence Component (Sprint 17: Community Identity & Visible Growth)
 *
 * "What We're Learning Together" section showing systemic issues,
 * cross-city adoptions, domain trends, and collective progress.
 */
import { useLatestIntelligence } from "../../hooks/useIntelligence";
import { Card } from "../ui";

interface CommunityIntelligenceProps {
  domainFilter?: string;
}

export function CommunityIntelligence({ domainFilter }: CommunityIntelligenceProps) {
  const { data, isLoading, error } = useLatestIntelligence();

  if (isLoading) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">What We&apos;re Learning Together</h3>
        <p className="text-gray-400 text-sm">Loading community intelligence...</p>
      </Card>
    );
  }

  if (error || !data?.data) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">What We&apos;re Learning Together</h3>
        <p className="text-gray-500 text-sm">
          No intelligence report available yet. Reports are generated monthly.
        </p>
      </Card>
    );
  }

  const report = data.data;
  const progress = report.data?.collectiveProgress;
  const trends = report.data?.domainTrends ?? [];
  const filteredTrends = domainFilter
    ? trends.filter((t: { domain: string }) => t.domain === domainFilter)
    : trends.slice(0, 5);

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-3">What We&apos;re Learning Together</h3>
      <p className="text-xs text-gray-400 mb-3">Report: {report.reportMonth}</p>

      {progress && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="text-center">
            <span className="text-xl font-bold text-blue-600">{progress.totalMissionsCompleted}</span>
            <span className="block text-xs text-gray-500">Missions</span>
          </div>
          <div className="text-center">
            <span className="text-xl font-bold text-green-600">{progress.totalProblemsResolved}</span>
            <span className="block text-xs text-gray-500">Resolved</span>
          </div>
          <div className="text-center">
            <span className="text-xl font-bold text-purple-600">{progress.totalNewMembers}</span>
            <span className="block text-xs text-gray-500">New Members</span>
          </div>
          <div className="text-center">
            <span className="text-xl font-bold text-amber-600">{progress.activeParticipants}</span>
            <span className="block text-xs text-gray-500">Active</span>
          </div>
        </div>
      )}

      {filteredTrends.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">Domain Trends</h4>
          <div className="space-y-2">
            {filteredTrends.map((t: { domain: string; problemsDelta: number; missionsDelta: number; membersDelta: number }) => (
              <div key={t.domain} className="flex items-center gap-3 text-sm">
                <span className="text-gray-700 capitalize flex-1">{t.domain.replace(/_/g, " ")}</span>
                <span className="text-xs text-gray-400">
                  +{t.problemsDelta} problems, +{t.missionsDelta} missions, +{t.membersDelta} members
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
