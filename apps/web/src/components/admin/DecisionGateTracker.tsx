"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface Criterion {
  id: string;
  label: string;
  status: "pass" | "fail" | "pending";
  auto: boolean;
  value: string;
}

interface DecisionGateData {
  criteria: Criterion[];
  summary: { passed: number; total: number; ready: boolean };
  recommendation: string;
}

function statusIcon(status: string): string {
  if (status === "pass") return "\u2713";
  if (status === "fail") return "\u2717";
  return "\u2022";
}

function statusColor(status: string): string {
  if (status === "pass") return "text-green-600 bg-green-50";
  if (status === "fail") return "text-red-600 bg-red-50";
  return "text-charcoal-light bg-charcoal/5";
}

export default function DecisionGateTracker() {
  const [data, setData] = useState<DecisionGateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/admin/phase3/production-shift/decision-gate");
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
        <h2 className="text-lg font-semibold text-charcoal">Decision Gate</h2>
        <div className="bg-cream rounded-xl shadow-neu-sm p-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-8 bg-charcoal/5 rounded animate-pulse mb-2" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-cream rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-red-600 font-medium mb-1">Error loading decision gate</p>
        <p className="text-charcoal-light text-sm">{error ?? "No data"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">Decision Gate</h2>

      {/* Progress Summary */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-charcoal-light">Exit Criteria Progress</p>
              <p className="text-3xl font-bold text-charcoal">
                {data.summary.passed} / {data.summary.total}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              data.summary.ready ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}>
              <span className={`w-2 h-2 rounded-full ${data.summary.ready ? "bg-green-500" : "bg-yellow-500"}`} />
              {data.summary.ready ? "Ready" : "In Progress"}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-charcoal/5 rounded-full h-2 mb-4">
            <div
              className={`h-full rounded-full transition-all ${data.summary.ready ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${(data.summary.passed / data.summary.total) * 100}%` }}
            />
          </div>

          {/* Criteria List */}
          <div className="space-y-2">
            {data.criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="flex items-center justify-between py-2 border-b border-charcoal/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${statusColor(criterion.status)}`}>
                    {statusIcon(criterion.status)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-charcoal">{criterion.label}</p>
                    <p className="text-xs text-charcoal-light">{criterion.value}</p>
                  </div>
                </div>
                <span className="text-xs text-charcoal-light">
                  {criterion.auto ? "Auto" : "Manual"}
                </span>
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            data.summary.ready ? "bg-green-50 text-green-800" : "bg-yellow-50 text-yellow-800"
          }`}>
            {data.recommendation}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
