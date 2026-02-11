"use client";

interface ImpactMetricsProps {
  totals: {
    missionsCompleted: number;
    impactTokensDistributed: number;
    activeHumans: number;
    problemsReported: number;
    solutionsProposed: number;
  };
}

const METRICS = [
  { key: "missionsCompleted" as const, label: "Missions Completed", icon: "checkmark" },
  { key: "impactTokensDistributed" as const, label: "Impact Tokens", icon: "token" },
  { key: "activeHumans" as const, label: "Active Humans", icon: "people" },
  { key: "problemsReported" as const, label: "Problems Reported", icon: "alert" },
  { key: "solutionsProposed" as const, label: "Solutions Proposed", icon: "bulb" },
];

export function ImpactMetrics({ totals }: ImpactMetricsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {METRICS.map(({ key, label }) => (
        <div key={key} className="bg-white rounded-xl shadow-neu-sm p-4 text-center">
          <p className="text-2xl font-bold text-terracotta">
            {totals[key].toLocaleString()}
          </p>
          <p className="text-xs text-charcoal-light mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
}
