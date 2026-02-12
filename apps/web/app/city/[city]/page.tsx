"use client";

/**
 * City Dashboard Page (Sprint 11 — T044)
 *
 * Dynamic route for city-level metrics dashboard.
 */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import CityHeatmap from "../../../src/components/CityHeatmap";
import { API_BASE } from "../../../src/lib/api";

interface CityMetrics {
  city: string;
  displayName: string;
  metrics: {
    problemsByCategory: Array<{ domain: string; count: number }>;
    avgResolutionTimeDays: number | null;
    activeLocalValidators: number;
    totalProblems: number;
    totalObservations: number;
  };
  heatmap: Array<{ lat: number; lng: number; intensity: number }>;
  lastAggregatedAt: string | null;
}

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  portland: { lat: 45.5152, lng: -122.6784 },
  chicago: { lat: 41.8781, lng: -87.6298 },
};

export default function CityDashboardPage() {
  const params = useParams();
  const cityId = params.city as string;
  const [data, setData] = useState<CityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/city/${cityId}/metrics`);
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        } else {
          const json = await res.json();
          setError(json.error?.message || "Failed to load city metrics");
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [cityId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-gray-500">Loading city dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-red-500">{error || "City not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">{data.displayName}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {data.metrics.totalProblems} total problems reported
        {data.lastAggregatedAt && (
          <span> &middot; Last updated {new Date(data.lastAggregatedAt).toLocaleDateString()}</span>
        )}
      </p>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Problems</p>
          <p className="text-2xl font-bold text-gray-900">{data.metrics.totalProblems}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Observations</p>
          <p className="text-2xl font-bold text-gray-900">{data.metrics.totalObservations}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Local Validators</p>
          <p className="text-2xl font-bold text-blue-600">{data.metrics.activeLocalValidators}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Avg Resolution</p>
          <p className="text-2xl font-bold text-gray-900">
            {data.metrics.avgResolutionTimeDays != null
              ? `${data.metrics.avgResolutionTimeDays}d`
              : "N/A"}
          </p>
        </div>
      </div>

      {/* Problems by category */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Problems by Category</h2>
        {data.metrics.problemsByCategory.length === 0 ? (
          <p className="text-sm text-gray-500">No problem data available.</p>
        ) : (
          <div className="space-y-2">
            {data.metrics.problemsByCategory.map((cat) => {
              const maxCount = Math.max(
                ...data.metrics.problemsByCategory.map((c) => c.count),
                1,
              );
              const pct = (cat.count / maxCount) * 100;

              return (
                <div key={cat.domain} className="flex items-center gap-3">
                  <span className="w-48 truncate text-sm text-gray-700">
                    {cat.domain.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1">
                    <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-10 text-right text-sm font-medium text-gray-900">
                    {cat.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Heatmap */}
      <CityHeatmap
        center={CITY_CENTERS[cityId] ?? { lat: 0, lng: 0 }}
        heatmapData={data.heatmap}
      />
    </div>
  );
}
