"use client";

import { useEffect, useState } from "react";

import { FraudQueue } from "../../../../src/components/fraud/FraudQueue";
import { API_BASE, getAdminToken, getAuthHeaders } from "../../../../src/lib/api";

interface FraudStats {
  totalFlagged: number;
  totalSuspended: number;
  totalCleared: number;
}

export default function AdminFraudPage() {
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [queue, setQueue] = useState<Array<{
    humanId: string;
    displayName: string;
    email: string;
    fraudScore: { total: number; phash: number; velocity: number; statistical: number };
    status: string;
    flaggedAt: string | null;
    suspendedAt: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "flagged" | "suspended">("all");

  const fetchData = async () => {
    setLoading(true);
    const adminToken = getAdminToken();
    const headers = getAuthHeaders(adminToken);

    try {
      const [statsRes, queueRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/admin/fraud/stats`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/fraud/queue?status=${filter}&limit=50`, { headers }),
      ]);

      const statsData = await statsRes.json();
      const queueData = await queueRes.json();

      if (statsData.ok) setStats(statsData.data);
      if (queueData.ok) setQueue(queueData.data);
    } catch {
      // fetch failed
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [filter]); // re-fetch on filter change

  return (
    <main className="px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-charcoal mb-2">Fraud Review Queue</h1>
        <p className="text-charcoal-light mb-8">Review flagged and suspended accounts</p>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-cream rounded-xl shadow-neu-sm p-5">
              <p className="text-sm text-charcoal-light mb-1">Flagged</p>
              <p className="text-3xl font-bold text-amber-600">{stats.totalFlagged}</p>
            </div>
            <div className="bg-cream rounded-xl shadow-neu-sm p-5">
              <p className="text-sm text-charcoal-light mb-1">Suspended</p>
              <p className="text-3xl font-bold text-red-600">{stats.totalSuspended}</p>
            </div>
            <div className="bg-cream rounded-xl shadow-neu-sm p-5">
              <p className="text-sm text-charcoal-light mb-1">Cleared</p>
              <p className="text-3xl font-bold text-green-600">{stats.totalCleared}</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(["all", "flagged", "suspended"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                filter === f
                  ? "bg-terracotta text-cream"
                  : "bg-cream text-charcoal-light hover:bg-charcoal/5"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <FraudQueue entries={queue} loading={loading} />
      </div>
    </main>
  );
}
