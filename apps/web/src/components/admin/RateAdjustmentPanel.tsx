"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface RateAdjustment {
  id: string;
  adjustmentType: "increase" | "decrease" | "none";
  faucetSinkRatio: number;
  rewardMultiplierBefore: number;
  rewardMultiplierAfter: number;
  costMultiplierBefore: number;
  costMultiplierAfter: number;
  changePercent: number;
  circuitBreakerActive: boolean;
  triggeredBy: string;
  createdAt: string;
}

export default function RateAdjustmentPanel() {
  const [adjustments, setAdjustments] = useState<RateAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideReward, setOverrideReward] = useState("");
  const [overrideCost, setOverrideCost] = useState("");
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/admin/rate-adjustments?limit=10");
        if (!res.ok) throw new Error("Failed to fetch rate adjustments");
        const json = await res.json();
        if (!cancelled) setAdjustments(json.data?.adjustments ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const handleOverride = async () => {
    const reward = parseFloat(overrideReward);
    const cost = parseFloat(overrideCost);
    if (isNaN(reward) || isNaN(cost) || reward < 0.01 || cost < 0.01) return;

    setOverriding(true);
    try {
      const res = await fetch("/api/v1/admin/rate-adjustments/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardMultiplier: reward, costMultiplier: cost }),
      });
      if (!res.ok) throw new Error("Failed to apply override");
      setOverrideReward("");
      setOverrideCost("");
      // Refresh
      const refreshRes = await fetch("/api/v1/admin/rate-adjustments?limit=10");
      if (refreshRes.ok) {
        const json = await refreshRes.json();
        setAdjustments(json.data?.adjustments ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setOverriding(false);
    }
  };

  const latest = adjustments[0];
  const circuitBreakerActive = latest?.circuitBreakerActive ?? false;

  if (loading) return <Card><CardBody><p className="text-gray-500">Loading rate adjustments...</p></CardBody></Card>;
  if (error) return <Card><CardBody><p className="text-red-500">{error}</p></CardBody></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold mb-4">Credit Economy Rates</h3>

          {circuitBreakerActive && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 font-medium">
              Circuit Breaker Active — Auto-adjustments paused
            </div>
          )}

          {latest && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-500 mb-1">Reward Multiplier</p>
                <p className="text-xl font-semibold">{Number(latest.rewardMultiplierAfter).toFixed(4)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-500 mb-1">Cost Multiplier</p>
                <p className="text-xl font-semibold">{Number(latest.costMultiplierAfter).toFixed(4)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-500 mb-1">Faucet/Sink Ratio</p>
                <p className="text-xl font-semibold">{Number(latest.faucetSinkRatio).toFixed(2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-500 mb-1">Last Adjustment</p>
                <p className="text-sm font-medium">{latest.adjustmentType} ({latest.triggeredBy})</p>
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Manual Override</h4>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Reward Multiplier</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5"
                  value={overrideReward}
                  onChange={(e) => setOverrideReward(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="1.0"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Cost Multiplier</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5"
                  value={overrideCost}
                  onChange={(e) => setOverrideCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="1.0"
                />
              </div>
              <button
                onClick={handleOverride}
                disabled={overriding}
                className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {overriding ? "..." : "Apply"}
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Adjustment History</h4>
          <div className="space-y-2">
            {adjustments.map((adj) => (
              <div key={adj.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                <div>
                  <span className={`font-medium ${
                    adj.adjustmentType === "increase" ? "text-green-600" :
                    adj.adjustmentType === "decrease" ? "text-red-600" :
                    "text-gray-600"
                  }`}>
                    {adj.adjustmentType}
                  </span>
                  <span className="text-gray-500 ml-2">
                    {Number(adj.changePercent).toFixed(1)}%
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(adj.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
            {adjustments.length === 0 && (
              <p className="text-sm text-gray-400">No adjustments recorded yet</p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
