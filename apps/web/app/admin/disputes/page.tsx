"use client";

import { useEffect, useState, useCallback } from "react";

import DisputeReviewPanel from "../../../src/components/admin/DisputeReviewPanel";

interface Dispute {
  id: string;
  consensusId: string;
  challengerAgentId: string;
  stakeAmount: number;
  reasoning: string;
  status: string;
  createdAt: string;
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/disputes/admin/queue?status=open");
      if (!res.ok) throw new Error("Failed to fetch dispute queue");
      const json = await res.json();
      setDisputes(json.data?.disputes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const handleResolve = async (disputeId: string, verdict: "upheld" | "dismissed", adminNotes: string) => {
    const res = await fetch(`/api/v1/disputes/admin/${disputeId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict, adminNotes }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? "Failed to resolve");
    }
    setSelected(null);
    await fetchDisputes();
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Dispute Review Queue</h1>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">
            Pending ({disputes.length})
          </h2>
          {disputes.map((d) => (
            <div
              key={d.id}
              onClick={() => setSelected(d)}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selected?.id === d.id ? "border-emerald-500 bg-emerald-50" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">
                    Consensus: {d.consensusId.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(d.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-sm font-medium text-emerald-600">
                  {d.stakeAmount} credits
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">{d.reasoning}</p>
            </div>
          ))}
          {!loading && disputes.length === 0 && (
            <p className="text-center text-gray-400 py-8">No pending disputes</p>
          )}
        </div>

        <div>
          {selected ? (
            <DisputeReviewPanel dispute={selected} onResolve={handleResolve} />
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center text-gray-400">
              Select a dispute to review
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
