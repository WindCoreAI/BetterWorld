"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface Cluster {
  id: string;
  title: string;
  description: string | null;
  domain: string;
  city: string | null;
  memberCount: number;
  isSystemic: boolean;
  radiusMeters: number;
  lastAggregatedAt: string | null;
  summaryGeneratedAt: string | null;
}

export default function PatternClusterView() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "systemic">("all");

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        setLoading(true);
        const params = filter === "systemic" ? "?systemic=true" : "";
        const res = await fetch(`/api/v1/patterns${params}`);
        if (!res.ok) throw new Error("Failed to fetch clusters");
        const json = await res.json();
        if (!cancelled) setClusters(json.data?.clusters ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/v1/patterns/admin/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      // Refetch after refresh
      const listRes = await fetch("/api/v1/patterns");
      if (listRes.ok) {
        const json = await listRes.json();
        setClusters(json.data?.clusters ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <Card><CardBody><p className="text-gray-500">Loading clusters...</p></CardBody></Card>;
  if (error) return <Card><CardBody><p className="text-red-500">{error}</p></CardBody></Card>;

  const systemicCount = clusters.filter(c => c.isSystemic).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Problem Clusters</h3>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-gray-100 rounded-md p-1">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1 rounded text-sm ${filter === "all" ? "bg-white shadow font-medium" : "text-gray-600"}`}
                >
                  All ({clusters.length})
                </button>
                <button
                  onClick={() => setFilter("systemic")}
                  className={`px-3 py-1 rounded text-sm ${filter === "systemic" ? "bg-white shadow font-medium" : "text-gray-600"}`}
                >
                  Systemic ({systemicCount})
                </button>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {clusters.map((cluster) => (
              <div key={cluster.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-sm">{cluster.title}</h4>
                    {cluster.city && (
                      <p className="text-xs text-gray-500 mt-0.5">{cluster.city}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {cluster.isSystemic && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        Systemic
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                      {cluster.domain.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>

                {cluster.description && (
                  <p className="text-sm text-gray-600 mb-2">{cluster.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{cluster.memberCount} problems</span>
                  <span>{Math.round(cluster.radiusMeters)}m radius</span>
                  {cluster.lastAggregatedAt && (
                    <span>Updated: {new Date(cluster.lastAggregatedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}

            {clusters.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No clusters found. Run aggregation to detect patterns.
              </p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
