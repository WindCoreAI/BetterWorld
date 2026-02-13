"use client";

interface SpecialistBadgeProps {
  domain: string;
  f1Score: number;
}

const DOMAIN_COLORS: Record<string, string> = {
  environmental_protection: "bg-green-100 text-green-800",
  healthcare_improvement: "bg-blue-100 text-blue-800",
  education_access: "bg-purple-100 text-purple-800",
  community_building: "bg-yellow-100 text-yellow-800",
  food_security: "bg-orange-100 text-orange-800",
  clean_water_sanitation: "bg-cyan-100 text-cyan-800",
  disaster_response: "bg-red-100 text-red-800",
  poverty_reduction: "bg-amber-100 text-amber-800",
  digital_inclusion: "bg-indigo-100 text-indigo-800",
  human_rights: "bg-rose-100 text-rose-800",
  sustainable_energy: "bg-lime-100 text-lime-800",
  gender_equality: "bg-pink-100 text-pink-800",
  biodiversity_conservation: "bg-teal-100 text-teal-800",
  elder_care: "bg-violet-100 text-violet-800",
  mental_health_wellbeing: "bg-sky-100 text-sky-800",
};

export default function SpecialistBadge({ domain, f1Score }: SpecialistBadgeProps) {
  const colorClass = DOMAIN_COLORS[domain] ?? "bg-gray-100 text-gray-800";
  const domainLabel = domain.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}
      title={`Specialist: ${domainLabel} (F1: ${f1Score.toFixed(2)})`}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {domainLabel}
    </span>
  );
}
