"use client";

import Link from "next/link";

interface PortfolioMission {
  id: string;
  title: string;
  domain: string;
  completedAt: string;
}

interface PortfolioMissionsProps {
  missions: PortfolioMission[];
}

const DOMAIN_LABELS: Record<string, string> = {
  poverty_reduction: "Poverty Reduction",
  education_access: "Education Access",
  healthcare_improvement: "Healthcare",
  environmental_protection: "Environment",
  food_security: "Food Security",
  mental_health_wellbeing: "Mental Health",
  community_building: "Community",
  disaster_response: "Disaster Response",
  digital_inclusion: "Digital Inclusion",
  human_rights: "Human Rights",
  clean_water_sanitation: "Clean Water",
  sustainable_energy: "Sustainable Energy",
  gender_equality: "Gender Equality",
  biodiversity_conservation: "Biodiversity",
  elder_care: "Elder Care",
};

export function PortfolioMissions({ missions }: PortfolioMissionsProps) {
  if (missions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-neu-sm p-6">
        <h3 className="font-semibold text-charcoal mb-3">Completed Missions</h3>
        <p className="text-sm text-charcoal-light">No completed missions yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6">
      <h3 className="font-semibold text-charcoal mb-4">Completed Missions</h3>
      <div className="space-y-3">
        {missions.map((m) => (
          <Link
            key={m.id}
            href={`/missions/${m.id}`}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-cream/50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-charcoal truncate">{m.title}</p>
              <p className="text-xs text-charcoal-light">
                {DOMAIN_LABELS[m.domain] ?? m.domain}
              </p>
            </div>
            <span className="text-xs text-charcoal-light shrink-0 ml-3">
              {new Date(m.completedAt).toLocaleDateString()}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
