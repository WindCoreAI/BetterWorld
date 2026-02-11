"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { API_BASE, getAdminToken, getAuthHeaders } from "../../../src/lib/api";

interface DashboardStats {
  pendingCount: number | null;
  totalFlagged: number | null;
  systemHealthy: boolean | null;
  authError: boolean;
}

interface FlaggedMetaResponse {
  ok: boolean;
  meta?: { total: number };
}

export default function AdminPage() {
  const [stats, setStats] = useState<DashboardStats>({
    pendingCount: null,
    totalFlagged: null,
    systemHealthy: null,
    authError: false,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const adminToken = getAdminToken();
      const headers = getAuthHeaders(adminToken);

      const [pendingResult, totalResult, healthResult] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/admin/flagged?status=pending_review&limit=1`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/flagged?limit=1`, { headers }),
        fetch(`${API_BASE}/api/v1/health`),
      ]);

      // Check for auth failures (401/403)
      const hasAuthError = [pendingResult, totalResult].some(
        (r) => r.status === "fulfilled" && (r.value.status === 401 || r.value.status === 403),
      );

      const pendingCount = pendingResult.status === "fulfilled" && pendingResult.value.ok
        ? ((await pendingResult.value.json()) as FlaggedMetaResponse).meta?.total ?? 0
        : 0;
      const totalFlagged = totalResult.status === "fulfilled" && totalResult.value.ok
        ? ((await totalResult.value.json()) as FlaggedMetaResponse).meta?.total ?? 0
        : 0;
      const systemHealthy = healthResult.status === "fulfilled" && healthResult.value.ok;

      setStats({ pendingCount, totalFlagged, systemHealthy, authError: hasAuthError });
    };

    fetchStats();
  }, []);

  return (
    <main className="px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-charcoal mb-2">
          Admin Dashboard
        </h1>
        <p className="text-charcoal-light mb-8">
          Monitor platform health, manage guardrails, and review flagged
          content.
        </p>

        {stats.authError && (
          <div className="p-4 rounded-lg bg-error/10 text-error font-medium mb-6">
            Authentication error: your admin token may be expired or invalid.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Pending Reviews */}
          <div className="bg-cream rounded-xl shadow-neu-sm p-6">
            <h2 className="text-sm font-medium text-charcoal-light uppercase tracking-wide mb-2">
              Pending Reviews
            </h2>
            <p className="text-4xl font-bold text-terracotta">
              {stats.pendingCount === null ? "..." : stats.pendingCount}
            </p>
          </div>

          {/* Total Flagged */}
          <div className="bg-cream rounded-xl shadow-neu-sm p-6">
            <h2 className="text-sm font-medium text-charcoal-light uppercase tracking-wide mb-2">
              Total Flagged
            </h2>
            <p className="text-4xl font-bold text-charcoal">
              {stats.totalFlagged === null ? "..." : stats.totalFlagged}
            </p>
          </div>

          {/* System Status */}
          <div className="bg-cream rounded-xl shadow-neu-sm p-6">
            <h2 className="text-sm font-medium text-charcoal-light uppercase tracking-wide mb-2">
              System Status
            </h2>
            {stats.systemHealthy === null ? (
              <p className="text-4xl font-bold text-charcoal-light">...</p>
            ) : stats.systemHealthy ? (
              <p className="text-4xl font-bold text-green-600">Healthy</p>
            ) : (
              <p className="text-4xl font-bold text-red-600">Error</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-cream rounded-xl shadow-neu-sm p-6 flex flex-col justify-between gap-3">
            <h2 className="text-sm font-medium text-charcoal-light uppercase tracking-wide mb-2">
              Quick Actions
            </h2>
            <Link
              href="/admin/flagged"
              className="inline-block px-5 py-2.5 bg-terracotta text-cream font-medium rounded-lg hover:bg-terracotta/90 transition-colors text-center"
            >
              Review Flagged Content
            </Link>
            <Link
              href="/admin/fraud"
              className="inline-block px-5 py-2.5 bg-charcoal text-cream font-medium rounded-lg hover:bg-charcoal/90 transition-colors text-center"
            >
              Fraud Review Queue
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
