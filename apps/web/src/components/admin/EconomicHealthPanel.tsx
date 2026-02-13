"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface FaucetSinkEntry {
  transactionType: string;
  faucet: number;
  sink: number;
  txCount: number;
}

interface BalanceDistribution {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  min: number;
  max: number;
}

interface TrendPoint {
  faucetSinkRatio: number;
  hardshipRate: number;
  medianBalance: number;
  alertTriggered: boolean;
  timestamp: string;
}

interface EconomicHealthData {
  faucetSinkBreakdown: FaucetSinkEntry[];
  balanceDistribution: BalanceDistribution;
  dailyTrend: TrendPoint[];
  hardshipAgents: { items: Array<{ id: string; name: string; creditBalance: number }>; hasMore: boolean };
}

function ratioColor(ratio: number): string {
  if (ratio >= 0.85 && ratio <= 1.15) return "bg-green-500";
  if (ratio >= 0.7 && ratio <= 1.3) return "bg-yellow-500";
  return "bg-red-500";
}

function ratioTextColor(ratio: number): string {
  if (ratio >= 0.85 && ratio <= 1.15) return "text-green-600";
  if (ratio >= 0.7 && ratio <= 1.3) return "text-yellow-600";
  return "text-red-600";
}

function DistributionBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-charcoal-light w-8 text-right">{label}</span>
      <div className="flex-1 bg-charcoal/5 rounded-full h-4 overflow-hidden">
        <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-medium w-12 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

export default function EconomicHealthPanel() {
  const [data, setData] = useState<EconomicHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/admin/production-shift/economic-health");
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch_();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-charcoal">Economic Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-cream rounded-xl shadow-neu-sm p-4">
              <div className="h-4 bg-charcoal/5 rounded animate-pulse mb-2" />
              <div className="h-32 bg-charcoal/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-red-600 font-medium mb-1">Error loading economic health</p>
        <p className="text-charcoal-light text-sm">{error ?? "No data"}</p>
      </div>
    );
  }

  const latestTrend = data.dailyTrend[0];
  const currentRatio = latestTrend?.faucetSinkRatio ?? 1.0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">Economic Health</h2>

      {/* Faucet/Sink Ratio Hero */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${ratioColor(currentRatio)}`} />
            <div>
              <p className="text-xs text-charcoal-light">Faucet/Sink Ratio (24h)</p>
              <p className={`text-3xl font-bold ${ratioTextColor(currentRatio)}`}>
                {currentRatio.toFixed(2)}
              </p>
              <p className="text-xs text-charcoal-light">
                {currentRatio >= 0.85 && currentRatio <= 1.15 ? "Healthy" :
                 currentRatio >= 0.7 && currentRatio <= 1.3 ? "Warning" : "Critical"}
              </p>
            </div>
            {latestTrend && (
              <div className="ml-auto text-right">
                <p className="text-xs text-charcoal-light">Hardship Rate</p>
                <p className={`text-xl font-bold ${latestTrend.hardshipRate > 0.15 ? "text-red-600" : "text-green-600"}`}>
                  {(latestTrend.hardshipRate * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Faucet/Sink Breakdown */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Faucet/Sink by Type (7d)</h3>
            <div className="space-y-2">
              {data.faucetSinkBreakdown.map((entry) => (
                <div key={entry.transactionType} className="flex items-center justify-between text-sm">
                  <span className="text-charcoal truncate max-w-[140px]">{entry.transactionType}</span>
                  <div className="flex gap-3">
                    <span className="text-green-600">+{entry.faucet}</span>
                    <span className="text-red-600">-{entry.sink}</span>
                    <span className="text-charcoal-light text-xs">({entry.txCount}tx)</span>
                  </div>
                </div>
              ))}
              {data.faucetSinkBreakdown.length === 0 && (
                <p className="text-sm text-charcoal-light">No transactions in last 7 days</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Balance Distribution */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Balance Distribution</h3>
            <div className="space-y-1.5">
              <DistributionBar label="p10" value={data.balanceDistribution.p10} max={data.balanceDistribution.max} />
              <DistributionBar label="p25" value={data.balanceDistribution.p25} max={data.balanceDistribution.max} />
              <DistributionBar label="p50" value={data.balanceDistribution.p50} max={data.balanceDistribution.max} />
              <DistributionBar label="p75" value={data.balanceDistribution.p75} max={data.balanceDistribution.max} />
              <DistributionBar label="p90" value={data.balanceDistribution.p90} max={data.balanceDistribution.max} />
            </div>
            <div className="flex justify-between mt-2 text-xs text-charcoal-light">
              <span>Min: {data.balanceDistribution.min}</span>
              <span>Mean: {data.balanceDistribution.mean.toFixed(0)}</span>
              <span>Max: {data.balanceDistribution.max}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Hardship Agents */}
      {data.hardshipAgents.items.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">
              Hardship Agents ({data.hardshipAgents.items.length}{data.hardshipAgents.hasMore ? "+" : ""})
            </h3>
            <div className="space-y-1">
              {data.hardshipAgents.items.slice(0, 10).map((agent) => (
                <div key={agent.id} className="flex justify-between text-sm">
                  <span className="text-charcoal truncate max-w-[200px]">{agent.name || agent.id.slice(0, 8)}</span>
                  <span className="text-red-600 font-medium">{agent.creditBalance} credits</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
