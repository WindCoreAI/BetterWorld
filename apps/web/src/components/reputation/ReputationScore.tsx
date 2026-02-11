"use client";

interface ReputationScoreProps {
  totalScore: number;
  breakdown: {
    missionQuality: number;
    peerAccuracy: number;
    streak: number;
    endorsements: number;
  };
  tier: string;
  tierMultiplier: number;
}

const FACTOR_LABELS = [
  { key: "missionQuality" as const, label: "Mission Quality", weight: "40%", color: "bg-terracotta" },
  { key: "peerAccuracy" as const, label: "Peer Accuracy", weight: "30%", color: "bg-sage" },
  { key: "streak" as const, label: "Streak Bonus", weight: "20%", color: "bg-sky-500" },
  { key: "endorsements" as const, label: "Endorsements", weight: "10%", color: "bg-amber-500" },
];

export function ReputationScore({ totalScore, breakdown, tier, tierMultiplier }: ReputationScoreProps) {
  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-charcoal">Reputation Score</h3>
        <span className="text-2xl font-bold text-terracotta">{totalScore.toFixed(1)}</span>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm text-charcoal-light">
        <span className="capitalize font-medium">{tier}</span>
        <span>·</span>
        <span>{tierMultiplier}x multiplier</span>
      </div>

      <div className="space-y-3">
        {FACTOR_LABELS.map(({ key, label, weight, color }) => {
          const value = breakdown[key];
          return (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-charcoal-light">{label} ({weight})</span>
                <span className="font-medium">{value.toFixed(1)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`${color} h-2 rounded-full transition-all`}
                  style={{ width: `${Math.min(value, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
