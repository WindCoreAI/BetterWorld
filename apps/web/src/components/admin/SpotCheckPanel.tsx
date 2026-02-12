"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface DisagreementBreakdown {
  falseNegatives: number;
  falsePositives: number;
  missedFlags: number;
  overRejections: number;
}

interface SpotCheckStats {
  total: number;
  agreements: number;
  disagreements: number;
  agreementRate: number;
  disagreementBreakdown: DisagreementBreakdown;
}

interface Disagreement {
  id: string;
  submissionId: string;
  submissionType: string;
  peerDecision: string;
  layerBDecision: string;
  disagreementType: string;
  adminReviewed: boolean;
  adminVerdict: string | null;
  createdAt: string;
}

export default function SpotCheckPanel() {
  const [stats, setStats] = useState<SpotCheckStats | null>(null);
  const [disagreements, setDisagreements] = useState<Disagreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        setLoading(true);
        const [statsRes, disagRes] = await Promise.all([
          fetch("/api/v1/admin/spot-checks/stats"),
          fetch("/api/v1/admin/spot-checks/disagreements?reviewed=false&limit=10"),
        ]);
        if (!statsRes.ok || !disagRes.ok) throw new Error("Failed to fetch spot check data");
        const statsJson = await statsRes.json();
        const disagJson = await disagRes.json();
        if (!cancelled) {
          setStats(statsJson.data);
          setDisagreements(disagJson.data ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch_();
    return () => { cancelled = true; };
  }, []);

  async function handleReview(id: string, verdict: string) {
    try {
      const res = await fetch(`/api/v1/admin/spot-checks/${id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict }),
      });
      if (res.ok) {
        setDisagreements((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
      // Silently fail — user can retry
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-charcoal">Spot Checks</h2>
        <div className="bg-cream rounded-xl shadow-neu-sm p-4">
          <div className="h-32 bg-charcoal/5 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-red-600 font-medium mb-1">Error loading spot checks</p>
        <p className="text-charcoal-light text-sm">{error ?? "No data"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">Spot Checks (5% sample)</h2>

      {/* Agreement Rate Hero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Agreement Rate</p>
            <p className={`text-4xl font-bold ${stats.agreementRate >= 90 ? "text-green-600" : stats.agreementRate >= 75 ? "text-yellow-600" : "text-red-600"}`}>
              {stats.agreementRate.toFixed(1)}%
            </p>
            <p className="text-xs text-charcoal-light mt-1">
              {stats.agreements} / {stats.total} checks agree
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Total Checks</p>
            <p className="text-2xl font-bold text-charcoal">{stats.total}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light mb-1">Disagreements</p>
            <p className={`text-2xl font-bold ${stats.disagreements > 0 ? "text-red-600" : "text-green-600"}`}>
              {stats.disagreements}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Disagreement Breakdown */}
      {stats.disagreements > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">Disagreement Types</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                ["False Neg", stats.disagreementBreakdown.falseNegatives, "text-red-600"],
                ["False Pos", stats.disagreementBreakdown.falsePositives, "text-orange-600"],
                ["Missed Flag", stats.disagreementBreakdown.missedFlags, "text-yellow-600"],
                ["Over Reject", stats.disagreementBreakdown.overRejections, "text-blue-600"],
              ] as const).map(([label, value, color]) => (
                <div key={label} className="text-center">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-charcoal-light">{label}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Unreviewed Disagreements */}
      {disagreements.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-charcoal-light mb-3">
              Pending Review ({disagreements.length})
            </h3>
            <div className="space-y-3">
              {disagreements.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2 bg-charcoal/5 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-charcoal">
                      {d.submissionType} — {d.disagreementType?.replace("_", " ")}
                    </p>
                    <p className="text-xs text-charcoal-light">
                      Peer: {d.peerDecision} vs Layer B: {d.layerBDecision}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleReview(d.id, "peer_correct")}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Peer
                    </button>
                    <button
                      onClick={() => handleReview(d.id, "layer_b_correct")}
                      className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                    >
                      Layer B
                    </button>
                    <button
                      onClick={() => handleReview(d.id, "inconclusive")}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      ?
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
