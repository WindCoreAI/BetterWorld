"use client";

/**
 * DomainCard Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Displays a domain with name, member count, missions, problems, and active milestone.
 * Links to the domain community page.
 */
import Link from "next/link";

import { Card } from "../ui";

interface DomainCardProps {
  slug: string;
  displayName: string;
  memberCount: number;
  missionsCompleted: number;
  problemsResolved: number;
  activeMilestone: {
    type: string;
    target: number;
    current: number;
  } | null;
}

const DOMAIN_COLORS: Record<string, string> = {
  poverty_reduction: "border-l-amber-500",
  education_access: "border-l-blue-500",
  healthcare_improvement: "border-l-red-500",
  environmental_protection: "border-l-green-500",
  food_security: "border-l-orange-500",
  mental_health_wellbeing: "border-l-purple-500",
  community_building: "border-l-indigo-500",
  disaster_response: "border-l-rose-500",
  digital_inclusion: "border-l-cyan-500",
  human_rights: "border-l-fuchsia-500",
  clean_water_sanitation: "border-l-sky-500",
  sustainable_energy: "border-l-lime-500",
  gender_equality: "border-l-pink-500",
  biodiversity_conservation: "border-l-emerald-500",
  elder_care: "border-l-teal-500",
};

export function DomainCard({
  slug,
  displayName,
  memberCount,
  missionsCompleted,
  problemsResolved,
  activeMilestone,
}: DomainCardProps) {
  const colorClass = DOMAIN_COLORS[slug] ?? "border-l-gray-500";
  const milestoneProgress = activeMilestone
    ? Math.min(100, Math.round((activeMilestone.current / activeMilestone.target) * 100))
    : null;

  return (
    <Link href={`/domains/${slug}`}>
      <Card className={`border-l-4 ${colorClass} hover:shadow-md transition-shadow cursor-pointer p-4`}>
        <h3 className="font-semibold text-lg mb-2">{displayName}</h3>

        <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 mb-3">
          <div>
            <span className="font-medium text-gray-900">{memberCount}</span>
            <span className="block text-xs">Members</span>
          </div>
          <div>
            <span className="font-medium text-gray-900">{missionsCompleted}</span>
            <span className="block text-xs">Missions</span>
          </div>
          <div>
            <span className="font-medium text-gray-900">{problemsResolved}</span>
            <span className="block text-xs">Resolved</span>
          </div>
        </div>

        {activeMilestone && milestoneProgress !== null && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{activeMilestone.type.replace(/_/g, " ")}</span>
              <span>{activeMilestone.current}/{activeMilestone.target}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>
        )}
      </Card>
    </Link>
  );
}
