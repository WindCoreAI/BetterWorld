"use client";

interface FraudScoreBreakdownProps {
  total: number;
  phash: number;
  velocity: number;
  statistical: number;
  status: string;
  flaggedAt: string | null;
  suspendedAt: string | null;
}

function scoreColor(score: number): string {
  if (score >= 150) return "text-red-600";
  if (score >= 50) return "text-amber-600";
  return "text-green-600";
}

export function FraudScoreBreakdown({
  total,
  phash,
  velocity,
  statistical,
  status,
  flaggedAt,
  suspendedAt,
}: FraudScoreBreakdownProps) {
  const factors = [
    { label: "pHash (Duplicate Detection)", value: phash, max: 200 },
    { label: "Velocity", value: velocity, max: 200 },
    { label: "Statistical", value: statistical, max: 200 },
  ];

  return (
    <div className="bg-cream rounded-xl shadow-neu-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-charcoal">Fraud Score</h3>
        <span className={`text-3xl font-bold ${scoreColor(total)}`}>{total}</span>
      </div>

      <div className="space-y-3 mb-4">
        {factors.map((f) => (
          <div key={f.label}>
            <div className="flex justify-between text-xs text-charcoal-light mb-1">
              <span>{f.label}</span>
              <span>{f.value}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full">
              <div
                className={`h-2 rounded-full transition-all ${
                  f.value >= 50 ? "bg-red-400" : "bg-green-400"
                }`}
                style={{ width: `${Math.min((f.value / f.max) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-charcoal-light space-y-1">
        <p>Status: <span className="font-medium text-charcoal">{status}</span></p>
        {flaggedAt && <p>Flagged: {new Date(flaggedAt).toLocaleString()}</p>}
        {suspendedAt && <p>Suspended: {new Date(suspendedAt).toLocaleString()}</p>}
      </div>
    </div>
  );
}
