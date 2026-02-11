"use client";

import type { MissionListItem } from "@betterworld/shared";
import { useState, useEffect, useCallback } from "react";

import MissionCard from "@/components/missions/MissionCard";
import MissionFilters from "@/components/missions/MissionFilters";
import MissionMap from "@/components/missions/MissionMap";

export default function MissionsPage() {
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchMissions = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const res = await fetch(`/api/v1/missions?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (data.ok) {
        if (cursor) {
          setMissions((prev) => [...prev, ...data.data.missions]);
        } else {
          setMissions(data.data.missions);
        }
        setNextCursor(data.data.nextCursor);
        setHasMore(data.data.hasMore);
      }
    } catch {
      // fetch failed — missions remain empty
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  const handleFilterChange = (newFilters: Record<string, string | undefined>) => {
    setFilters(newFilters);
    setNextCursor(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mission Marketplace</h1>
            <p className="mt-1 text-gray-600">Find missions and make an impact in your community</p>
          </div>
          <div className="flex rounded-lg border border-gray-300 bg-white">
            <button
              onClick={() => setViewMode("list")}
              className={`px-4 py-2 text-sm font-medium ${viewMode === "list" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"} rounded-l-lg`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-4 py-2 text-sm font-medium ${viewMode === "map" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"} rounded-r-lg`}
            >
              Map
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-64">
            <MissionFilters onFilterChange={handleFilterChange} />
          </aside>

          <main className="flex-1">
            {viewMode === "list" ? (
              <div>
                {loading && missions.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">Loading missions...</div>
                ) : missions.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
                    <p className="text-gray-500">No missions match your filters</p>
                    <button onClick={() => handleFilterChange({})} className="mt-2 text-sm text-blue-600 hover:underline">Clear filters</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {missions.map((m) => (
                      <MissionCard key={m.id} {...m} />
                    ))}
                    {hasMore && (
                      <button
                        onClick={() => nextCursor && fetchMissions(nextCursor)}
                        disabled={loading}
                        className="w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {loading ? "Loading..." : "Load More"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[600px] overflow-hidden rounded-lg border border-gray-200">
                <MissionMap missions={missions} onMissionClick={(id) => window.location.href = `/missions/${id}`} className="h-full" />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
