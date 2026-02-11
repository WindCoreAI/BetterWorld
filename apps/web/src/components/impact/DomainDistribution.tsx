"use client";

interface DomainData {
  domain: string;
  missionCount: number;
}

interface DomainDistributionProps {
  domains: DomainData[];
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

export function DomainDistribution({ domains }: DomainDistributionProps) {
  const maxCount = Math.max(...domains.map((d) => d.missionCount), 1);

  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6">
      <h3 className="font-semibold text-charcoal mb-4">Mission Distribution by Domain</h3>
      <div className="space-y-2">
        {domains.map((d) => (
          <div key={d.domain} className="flex items-center gap-3">
            <span className="text-xs text-charcoal-light w-28 truncate">
              {DOMAIN_LABELS[d.domain] ?? d.domain}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-4">
              <div
                className="bg-sage h-4 rounded-full transition-all"
                style={{ width: `${(d.missionCount / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-charcoal w-8 text-right">
              {d.missionCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
