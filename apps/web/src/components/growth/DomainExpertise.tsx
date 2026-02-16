"use client";

/**
 * DomainExpertise Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Domain breakdown with mission counts.
 */
import { Card } from "../ui";

interface DomainExpertiseProps {
  domains: Array<{ domain: string; missionsCompleted: number; f1Score: number | null }>;
}

export function DomainExpertise({ domains }: DomainExpertiseProps) {
  if (domains.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">Domain Expertise</h3>
        <p className="text-gray-500 text-sm">
          Complete missions across different domains to build expertise.
        </p>
      </Card>
    );
  }

  const maxMissions = Math.max(...domains.map((d) => d.missionsCompleted), 1);

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-3">Domain Expertise</h3>
      <div className="space-y-3">
        {domains.map((d) => (
          <div key={d.domain}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700 capitalize">{d.domain.replace(/_/g, " ")}</span>
              <span className="text-gray-500">{d.missionsCompleted} missions</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full"
                style={{ width: `${(d.missionsCompleted / maxMissions) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
