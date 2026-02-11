"use client";

import { useState } from "react";

import { API_BASE, getHumanToken } from "../../lib/api";

interface FraudActionsProps {
  humanId: string;
  currentStatus: string;
  onActionComplete?: () => void;
}

const ACTIONS = [
  { value: "clear_flag", label: "Clear Flag", description: "Remove flagged status" },
  { value: "reset_score", label: "Reset Score", description: "Reset all scores to 0" },
  { value: "manual_suspend", label: "Suspend", description: "Suspend user account" },
  { value: "unsuspend", label: "Unsuspend", description: "Reactivate suspended account" },
] as const;

export function FraudActions({ humanId, currentStatus, onActionComplete }: FraudActionsProps) {
  const [selectedAction, setSelectedAction] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableActions = ACTIONS.filter((a) => {
    if (currentStatus === "suspended") return a.value === "unsuspend";
    if (currentStatus === "flagged") return a.value !== "unsuspend";
    return a.value !== "clear_flag" && a.value !== "unsuspend";
  });

  const handleSubmit = async () => {
    if (!selectedAction || !reason.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = getHumanToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/fraud/${humanId}/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: selectedAction, reason: reason.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(`Action "${selectedAction}" applied successfully.`);
        setSelectedAction("");
        setReason("");
        onActionComplete?.();
      } else {
        setError(data.error?.message ?? "Action failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-cream rounded-xl shadow-neu-sm p-6">
      <h3 className="font-semibold text-charcoal mb-4">Admin Actions</h3>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {availableActions.map((action) => (
            <button
              key={action.value}
              onClick={() => setSelectedAction(action.value)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                selectedAction === action.value
                  ? "bg-terracotta text-cream"
                  : "bg-white text-charcoal hover:bg-charcoal/5"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        {selectedAction && (
          <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for this action (required)..."
              className="w-full px-3 py-2 text-sm border border-charcoal/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/50 resize-none"
              rows={3}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !reason.trim()}
              className="px-4 py-2 text-sm bg-terracotta text-cream rounded-lg font-medium hover:bg-terracotta-dark transition-colors disabled:opacity-50"
            >
              {loading ? "Processing..." : "Confirm Action"}
            </button>
          </>
        )}

        {result && <p className="text-sm text-green-600">{result}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
