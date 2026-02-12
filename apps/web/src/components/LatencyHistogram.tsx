"use client";

/**
 * LatencyHistogram Component (Sprint 11 — T034)
 *
 * Displays p50/p95/p99 as horizontal bar segments.
 * Visual indicator for whether p95 is under 15s target.
 */

interface LatencyHistogramProps {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  totalSamples: number;
  targetP95Ms?: number;
}

export default function LatencyHistogram({
  p50Ms,
  p95Ms,
  p99Ms,
  avgMs,
  totalSamples,
  targetP95Ms = 15000,
}: LatencyHistogramProps) {
  const maxMs = Math.max(p99Ms, targetP95Ms) * 1.2 || 1;
  const p95UnderTarget = p95Ms <= targetP95Ms;

  const formatMs = (ms: number): string => {
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
  };

  const bars = [
    { label: "p50", value: p50Ms, color: "bg-blue-400" },
    { label: "p95", value: p95Ms, color: p95UnderTarget ? "bg-green-500" : "bg-red-500" },
    { label: "p99", value: p99Ms, color: "bg-orange-500" },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Consensus Latency</h3>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              p95UnderTarget
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            p95 {p95UnderTarget ? "under" : "over"} {formatMs(targetP95Ms)} target
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="w-10 text-sm font-medium text-gray-600">{bar.label}</span>
            <div className="flex-1">
              <div className="h-6 w-full overflow-hidden rounded bg-gray-100">
                <div
                  className={`h-full rounded ${bar.color} transition-all`}
                  style={{ width: `${Math.min((bar.value / maxMs) * 100, 100)}%` }}
                />
              </div>
            </div>
            <span className="w-16 text-right text-sm text-gray-900">
              {formatMs(bar.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-6 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>Avg: {formatMs(avgMs)}</span>
        <span>Samples: {totalSamples.toLocaleString()}</span>
      </div>
    </div>
  );
}
