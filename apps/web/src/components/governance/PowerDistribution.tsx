"use client";

interface PowerDistributionProps {
  snapshot: {
    reviewGini: string;
    decisionConcentration: string;
    domainCoverage: string;
    geographicBalance: string;
    tierDistribution: Record<string, number>;
    computedAt: string;
  } | null;
}

export function PowerDistribution({ snapshot }: PowerDistributionProps) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No power audit data available yet.
      </div>
    );
  }

  const gini = parseFloat(snapshot.reviewGini);
  const giniLabel = gini < 0.3 ? "Equitable" : gini < 0.5 ? "Moderate" : "Concentrated";
  const giniColor = gini < 0.3 ? "text-green-600" : gini < 0.5 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Power Distribution</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Review Gini</p>
          <p className={`text-lg font-bold ${giniColor}`}>{gini.toFixed(3)}</p>
          <p className="text-xs text-gray-400">{giniLabel}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Decision Concentration</p>
          <p className="text-lg font-bold">{(parseFloat(snapshot.decisionConcentration) * 100).toFixed(1)}%</p>
          <p className="text-xs text-gray-400">Top 10% share</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Domain Coverage</p>
          <p className="text-lg font-bold">{(parseFloat(snapshot.domainCoverage) * 100).toFixed(0)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Geographic Balance</p>
          <p className="text-lg font-bold">{(parseFloat(snapshot.geographicBalance) * 100).toFixed(0)}%</p>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 p-3">
        <h4 className="text-sm font-medium mb-2">Tier Distribution</h4>
        <div className="space-y-1">
          {Object.entries(snapshot.tierDistribution).map(([tier, count]) => (
            <div key={tier} className="flex justify-between text-sm">
              <span className="capitalize text-gray-600">{tier}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Last computed: {new Date(snapshot.computedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
