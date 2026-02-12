"use client";

import { Card, CardBody } from "../ui";

interface CreditStats {
  totalCreditsInCirculation: number;
  totalStarterGrantsIssued: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  faucetSinkRatio: number;
  agentCount: number;
  distribution: {
    mean: number;
    median: number;
    p90: number;
    max: number;
  };
}

interface CreditEconomyDashboardProps {
  stats: CreditStats | null;
  loading: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function getRatioColor(ratio: number): string {
  if (ratio <= 0) return "text-charcoal-light";
  if (ratio < 2) return "text-green-600"; // Healthy: more spending than earning
  if (ratio < 5) return "text-yellow-600"; // Moderate
  return "text-red-600"; // Inflating: too many credits earned vs spent
}

export function CreditEconomyDashboard({ stats, loading }: CreditEconomyDashboardProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-charcoal">Credit Economy</h2>
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
        <p className="text-charcoal-light">Unable to load credit economy data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">Credit Economy</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Total in Circulation</p>
            <p className="text-2xl font-bold text-charcoal">
              {formatNumber(stats.totalCreditsInCirculation)}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Active Agents</p>
            <p className="text-2xl font-bold text-charcoal">
              {formatNumber(stats.agentCount)}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Starter Grants</p>
            <p className="text-2xl font-bold text-charcoal">
              {formatNumber(stats.totalStarterGrantsIssued)}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Faucet/Sink Ratio</p>
            <p className={`text-2xl font-bold ${getRatioColor(stats.faucetSinkRatio)}`}>
              {stats.faucetSinkRatio > 0 ? stats.faucetSinkRatio.toFixed(2) : "N/A"}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Flow Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Credit Flow</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Total Earned</span>
                <span className="text-sm font-medium text-green-600">
                  +{formatNumber(stats.totalCreditsEarned)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Total Spent</span>
                <span className="text-sm font-medium text-red-600">
                  -{formatNumber(stats.totalCreditsSpent)}
                </span>
              </div>
              <hr className="border-charcoal/10" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-charcoal">Net Flow</span>
                <span className={`text-sm font-bold ${
                  stats.totalCreditsEarned - stats.totalCreditsSpent >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}>
                  {stats.totalCreditsEarned - stats.totalCreditsSpent >= 0 ? "+" : ""}
                  {formatNumber(stats.totalCreditsEarned - stats.totalCreditsSpent)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Distribution</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Mean</span>
                <span className="text-sm font-medium text-charcoal">
                  {stats.distribution.mean.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Median</span>
                <span className="text-sm font-medium text-charcoal">
                  {stats.distribution.median.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">P90</span>
                <span className="text-sm font-medium text-charcoal">
                  {stats.distribution.p90.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-charcoal">Max</span>
                <span className="text-sm font-bold text-charcoal">
                  {formatNumber(stats.distribution.max)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
