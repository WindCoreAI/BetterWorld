"use client";

import { Card, CardBody } from "../ui";

interface ValidatorStats {
  totalValidators: number;
  activeValidators: number;
  suspendedValidators: number;
  tierBreakdown: {
    apprentice: number;
    journeyman: number;
    expert: number;
  };
  averageF1Score: number;
  averageResponseRate: number;
  totalEvaluationsToday: number;
}

interface ValidatorPoolDashboardProps {
  stats: ValidatorStats | null;
  loading: boolean;
  onBackfill?: () => void;
  backfillLoading?: boolean;
}

function tierColor(tier: string): string {
  switch (tier) {
    case "apprentice":
      return "bg-blue-100 text-blue-700";
    case "journeyman":
      return "bg-purple-100 text-purple-700";
    case "expert":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function f1ScoreColor(score: number): string {
  if (score >= 0.8) return "text-green-600";
  if (score >= 0.6) return "text-yellow-600";
  return "text-red-600";
}

export function ValidatorPoolDashboard({
  stats,
  loading,
  onBackfill,
  backfillLoading,
}: ValidatorPoolDashboardProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-charcoal">Validator Pool</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-cream rounded-xl shadow-neu-sm p-4">
              <div className="h-4 bg-charcoal/5 rounded animate-pulse mb-2" />
              <div className="h-8 bg-charcoal/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-charcoal-light">Unable to load validator pool data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal">Validator Pool</h2>
        {onBackfill && (
          <button
            onClick={onBackfill}
            disabled={backfillLoading}
            className="px-4 py-2 bg-terracotta text-cream rounded-lg text-sm font-medium hover:bg-terracotta-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backfillLoading ? "Backfilling..." : "Backfill Validators"}
          </button>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Total Validators</p>
            <p className="text-2xl font-bold text-charcoal">
              {stats.totalValidators}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Active</p>
            <p className="text-2xl font-bold text-green-600">
              {stats.activeValidators}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Suspended</p>
            <p className="text-2xl font-bold text-red-600">
              {stats.suspendedValidators}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Evaluations Today</p>
            <p className="text-2xl font-bold text-charcoal">
              {stats.totalEvaluationsToday}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tier Breakdown */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Tier Breakdown</h3>
            <div className="space-y-3">
              {(["apprentice", "journeyman", "expert"] as const).map((tier) => {
                const count = stats.tierBreakdown[tier];
                const percentage = stats.totalValidators > 0
                  ? Math.round((count / stats.totalValidators) * 100)
                  : 0;

                return (
                  <div key={tier} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tierColor(tier)}`}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </span>
                      <span className="text-sm text-charcoal">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-charcoal/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          tier === "apprentice"
                            ? "bg-blue-500"
                            : tier === "journeyman"
                              ? "bg-purple-500"
                              : "bg-amber-500"
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Performance Metrics */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Performance</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Average F1 Score</span>
                <span className={`text-lg font-bold ${f1ScoreColor(stats.averageF1Score)}`}>
                  {stats.averageF1Score.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Average Response Rate</span>
                <span className="text-lg font-bold text-charcoal">
                  {(stats.averageResponseRate * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Active / Total</span>
                <span className="text-lg font-bold text-charcoal">
                  {stats.totalValidators > 0
                    ? `${Math.round((stats.activeValidators / stats.totalValidators) * 100)}%`
                    : "N/A"}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
