"use client";

/**
 * DomainMetrics Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Displays the domain community metrics panel with counts.
 */
import { Card } from "../ui";

interface DomainMetricsProps {
  metrics: {
    memberCount: number;
    missionsCompleted: number;
    problemsResolved: number;
    activeMissions: number;
    totalSolutions: number;
  };
}

export function DomainMetrics({ metrics }: DomainMetricsProps) {
  const items = [
    { label: "Members", value: metrics.memberCount },
    { label: "Missions Completed", value: metrics.missionsCompleted },
    { label: "Problems Resolved", value: metrics.problemsResolved },
    { label: "Active Missions", value: metrics.activeMissions },
    { label: "Total Solutions", value: metrics.totalSolutions },
  ];

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-3">Community Metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <span className="text-2xl font-bold text-gray-900">{item.value}</span>
            <span className="block text-xs text-gray-500 mt-1">{item.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
