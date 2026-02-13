"use client";

import { useEffect, useState, useCallback } from "react";

import DisputeCard from "../../src/components/disputes/DisputeCard";

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
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchDisputes = useCallback(async () => {
    try {
      setLoading(true);
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/v1/disputes${params}`);
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
      {error && <p className="text-red-500">{error}</p>}

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
