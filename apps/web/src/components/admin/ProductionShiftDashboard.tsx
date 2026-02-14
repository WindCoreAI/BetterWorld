"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface RoutingStats {
  totalSubmissions: number;
  peerCount: number;
  layerBCount: number;
}

interface ConsensusStats {
  total: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  quorumFailures: number;
}

interface ValidatorStats {
  total: number;
  active: number;
  avgResponseRate: number;
}

interface EconomicHealthSummary {
  faucetSinkRatio: number;
  hardshipRate: number;
  medianBalance: number;
  alertTriggered: boolean;
  snapshotAt: string;
}

interface DashboardData {
  trafficPercentage: number;
  routing: RoutingStats;
  falseNegativeRate: number;
  consensus: ConsensusStats;
  validators: ValidatorStats;
  economicHealth: EconomicHealthSummary | null;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function trafficColor(pct: number): string {
  if (pct >= 80) return "text-green-600";
  if (pct >= 40) return "text-yellow-600";
  return "text-blue-600";
}

export default function ProductionShiftDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/admin/phase3/production-shift/dashboard");
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
        <h2 className="text-lg font-semibold text-charcoal">Production Shift</h2>
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

  if (error || !data) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-red-600 font-medium mb-1">Error loading dashboard</p>
        <p className="text-charcoal-light text-sm">{error ?? "No data"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-charcoal">Production Shift</h2>

      {/* Traffic Hero */}
      <Card>
        <CardBody>
          <div className="text-center py-4">
            <p className="text-sm text-charcoal-light mb-2">Peer Validation Traffic</p>
            <p className={`text-6xl font-bold ${trafficColor(data.trafficPercentage)}`}>
              {data.trafficPercentage}%
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Routing + Consensus */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardBody>
          <p className="text-xs text-charcoal-light mb-1">Total Submissions</p>
          <p className="text-2xl font-bold text-charcoal">{formatNumber(data.routing.totalSubmissions)}</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-xs text-charcoal-light mb-1">Peer Validated</p>
          <p className="text-2xl font-bold text-blue-600">{formatNumber(data.routing.peerCount)}</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-xs text-charcoal-light mb-1">Consensus p95</p>
          <p className="text-2xl font-bold text-charcoal">{formatNumber(data.consensus.p95LatencyMs)}ms</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-xs text-charcoal-light mb-1">False Neg Rate</p>
          <p className={`text-2xl font-bold ${data.falseNegativeRate > 5 ? "text-red-600" : "text-green-600"}`}>
            {data.falseNegativeRate.toFixed(1)}%
          </p>
        </CardBody></Card>
      </div>

      {/* Validators + Economic Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardBody>
          <h3 className="text-sm font-medium text-charcoal-light mb-3">Validators</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-charcoal">Active / Total</span>
              <span className="font-medium">{data.validators.active} / {data.validators.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-charcoal">Avg Response Rate</span>
              <span className="font-medium">{(data.validators.avgResponseRate * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-charcoal">Quorum Failures</span>
              <span className={`font-medium ${data.consensus.quorumFailures > 0 ? "text-red-600" : "text-green-600"}`}>
                {data.consensus.quorumFailures}
              </span>
            </div>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="text-sm font-medium text-charcoal-light mb-3">Economic Health</h3>
          {data.economicHealth ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-charcoal">Faucet/Sink</span>
                <span className={`font-medium ${
                  data.economicHealth.faucetSinkRatio >= 0.7 && data.economicHealth.faucetSinkRatio <= 1.3
                    ? "text-green-600" : "text-red-600"
                }`}>{data.economicHealth.faucetSinkRatio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-charcoal">Median Balance</span>
                <span className="font-medium">{data.economicHealth.medianBalance.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-charcoal">Hardship Rate</span>
                <span className={`font-medium ${data.economicHealth.hardshipRate > 0.15 ? "text-red-600" : "text-green-600"}`}>
                  {(data.economicHealth.hardshipRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-charcoal-light">No snapshot available yet</p>
          )}
        </CardBody></Card>
      </div>
    </div>
  );
}
