"use client";

import { useState } from "react";

import { Card, CardBody } from "../ui";

interface Dispute {
  id: string;
  consensusId: string;
  challengerAgentId: string;
  stakeAmount: number;
  reasoning: string;
  status: string;
  createdAt: string;
}

interface DisputeReviewPanelProps {
  dispute: Dispute;
  onResolve: (disputeId: string, verdict: "upheld" | "dismissed", adminNotes: string) => Promise<void>;
}

export default function DisputeReviewPanel({ dispute, onResolve }: DisputeReviewPanelProps) {
  const [verdict, setVerdict] = useState<"upheld" | "dismissed" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = verdict !== null && adminNotes.length >= 10;

  const handleSubmit = async () => {
    if (!verdict || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onResolve(dispute.id, verdict, adminNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve dispute");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold mb-4">Review Dispute</h3>

        <div className="mb-4 space-y-2 text-sm">
          <p>
            <span className="font-medium text-gray-500">Consensus ID:</span>{" "}
            <span className="font-mono">{dispute.consensusId.slice(0, 12)}...</span>
          </p>
          <p>
            <span className="font-medium text-gray-500">Challenger:</span>{" "}
            <span className="font-mono">{dispute.challengerAgentId.slice(0, 12)}...</span>
          </p>
          <p>
            <span className="font-medium text-gray-500">Stake:</span>{" "}
            {dispute.stakeAmount} credits
          </p>
          <p>
            <span className="font-medium text-gray-500">Filed:</span>{" "}
            {new Date(dispute.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <p className="text-xs font-medium text-gray-500 mb-1">Challenger&apos;s Reasoning</p>
          <p className="text-sm text-gray-700">{dispute.reasoning}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Verdict</label>
          <div className="flex gap-3">
            <button
              onClick={() => setVerdict("upheld")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium border ${
                verdict === "upheld"
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-green-50"
              }`}
            >
              Uphold (Refund + Bonus)
            </button>
            <button
              onClick={() => setVerdict("dismissed")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium border ${
                verdict === "dismissed"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-red-50"
              }`}
            >
              Dismiss (Forfeit Stake)
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="admin-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Admin Notes (min 10 characters)
          </label>
          <textarea
            id="admin-notes"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Explain your decision..."
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-emerald-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Resolving..." : "Submit Verdict"}
        </button>
      </CardBody>
    </Card>
  );
}
