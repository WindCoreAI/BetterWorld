"use client";

interface LeaderboardFiltersProps {
  period: string;
  onPeriodChange: (period: string) => void;
  domain: string | undefined;
  onDomainChange: (domain: string) => void;
}

const PERIODS = [
  { value: "alltime", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
];

const DOMAINS = [
  { value: "", label: "All Domains" },
  { value: "poverty_reduction", label: "Poverty Reduction" },
  { value: "education_access", label: "Education Access" },
  { value: "healthcare_improvement", label: "Healthcare" },
  { value: "environmental_protection", label: "Environment" },
  { value: "food_security", label: "Food Security" },
  { value: "mental_health_wellbeing", label: "Mental Health" },
  { value: "community_building", label: "Community" },
  { value: "disaster_response", label: "Disaster Response" },
  { value: "digital_inclusion", label: "Digital Inclusion" },
  { value: "human_rights", label: "Human Rights" },
  { value: "clean_water_sanitation", label: "Clean Water" },
  { value: "sustainable_energy", label: "Sustainable Energy" },
  { value: "gender_equality", label: "Gender Equality" },
  { value: "biodiversity_conservation", label: "Biodiversity" },
  { value: "elder_care", label: "Elder Care" },
];

export function LeaderboardFilters({
  period,
  onPeriodChange,
  domain,
  onDomainChange,
}: LeaderboardFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      <select
        value={domain}
        onChange={(e) => onDomainChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
      >
        {DOMAINS.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}
