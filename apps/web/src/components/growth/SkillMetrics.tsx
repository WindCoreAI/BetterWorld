"use client";

/**
 * SkillMetrics Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Displays 3 skill cards with current/previous/trend arrow.
 */
import { Card } from "../ui";

interface SkillData {
  current: number;
  previous30d: number;
  trend: string;
}

interface SkillMetricsProps {
  skills: {
    evidenceQuality: SkillData;
    reviewAccuracy: SkillData;
    missionCompletionRate: SkillData;
  };
}

function TrendArrow({ trend }: { trend: string }) {
  if (trend === "improving") return <span className="text-green-500 text-sm">&#9650;</span>;
  if (trend === "declining") return <span className="text-red-500 text-sm">&#9660;</span>;
  return <span className="text-gray-400 text-sm">&#8212;</span>;
}

export function SkillMetrics({ skills }: SkillMetricsProps) {
  const items = [
    { label: "Evidence Quality", ...skills.evidenceQuality },
    { label: "Review Accuracy", ...skills.reviewAccuracy },
    { label: "Mission Completion Rate", ...skills.missionCompletionRate },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-600">{item.label}</h4>
            <TrendArrow trend={item.trend} />
          </div>
          <span className="text-2xl font-bold text-gray-900">
            {Math.round(item.current * 100)}%
          </span>
          <span className="text-xs text-gray-400 block">
            prev 30d: {Math.round(item.previous30d * 100)}%
          </span>
        </Card>
      ))}
    </div>
  );
}
