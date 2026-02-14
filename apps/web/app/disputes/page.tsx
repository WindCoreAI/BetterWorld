"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import DisputeCard from "../../src/components/disputes/DisputeCard";
import { getHumanAuthHeaders } from "../../src/lib/api";
import { useOnboardingGuard } from "../../src/lib/onboardingGuard";

interface Dispute {
  id: string;
  consensusId: string;
  stakeAmount: number;
  reasoning: string;
  status: "open" | "admin_review" | "upheld" | "overturned" | "dismissed";
  adminNotes: string | null;
  stakeReturned: boolean;
  bonusPaid: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export default function DisputesPage() {
  const router = useRouter();
  const { shouldRedirect: needsOnboarding, isChecking: onboardingChecking } = useOnboardingGuard();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchDisputes = useCallback(async () => {
    try {
      setLoading(true);
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      // FR-016: Include authentication credentials on disputes fetch
      const res = await fetch(`/api/v1/disputes${params}`, {
        credentials: "include",
        headers: getHumanAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch disputes");
      const json = await res.json();
      setDisputes(json.data?.disputes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  // FR-023: Redirect to onboarding if not completed
  useEffect(() => {
    if (!onboardingChecking && needsOnboarding) {
      router.push("/onboarding");
    }
  }, [onboardingChecking, needsOnboarding, router]);

  if (onboardingChecking || needsOnboarding) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Disputes</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="upheld">Upheld</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {loading && <p className="text-gray-500">Loading disputes...</p>}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => fetchDisputes()}
            className="mt-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      <div className="space-y-4">
        {disputes.map((dispute) => (
          <DisputeCard key={dispute.id} dispute={dispute} />
        ))}
        {!loading && disputes.length === 0 && (
          <p className="text-center text-gray-400 py-12">No disputes found</p>
        )}
      </div>
    </div>
  );
}
