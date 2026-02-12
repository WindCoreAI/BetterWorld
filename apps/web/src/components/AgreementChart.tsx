"use client";

/**
 * AgreementChart Component (Sprint 11 — T033)
 *
 * Bar chart showing agreement rates by domain or type.
 */

interface AgreementChartProps {
  data: Array<{
    label: string;
    agreementRate: number;
    totalSubmissions: number;
  }>;
  title: string;
}

export default function AgreementChart({ data, title }: AgreementChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
      <div className="space-y-3">
        {data.map((item) => {
          const pct = Math.round(item.agreementRate * 100);
          const barColor =
            pct >= 90 ? "bg-green-500" : pct >= 80 ? "bg-yellow-500" : "bg-red-500";

          return (
            <div key={item.label} className="flex items-center gap-3">
              <span className="w-40 truncate text-sm text-gray-700" title={item.label}>
                {item.label}
              </span>
              <div className="flex-1">
                <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="w-16 text-right text-sm font-medium text-gray-900">
                {pct}%
              </span>
              <span className="w-12 text-right text-xs text-gray-500">
                ({item.totalSubmissions})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
