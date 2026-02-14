"use client";

import { useState, useEffect } from "react";

import { getHumanAuthHeaders } from "../../lib/api";
import { Card, CardBody } from "../ui";

interface DisputeFormProps {
  consensusId: string;
  stakeAmount?: number;
  onSubmit: (data: { consensusId: string; reasoning: string }) => Promise<void>;
  onCancel: () => void;
}

export default function DisputeForm({
  consensusId,
  stakeAmount = 10,
  onSubmit,
  onCancel,
}: DisputeFormProps) {
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // FR-019: Fetch credit balance on mount to check if user can afford the stake
  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await fetch("/api/v1/tokens/balance", {
          credentials: "include",
          headers: getHumanAuthHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          setBalance(json.data?.balance ?? 0);
        }
      } catch {
        // Non-blocking: if balance check fails, allow form but server will reject if insufficient
      } finally {
        setBalanceLoading(false);
      }
    }
    fetchBalance();
  }, []);

  const insufficientBalance = balance !== null && balance < stakeAmount;
  const isValid = reasoning.length >= 50 && reasoning.length <= 2000 && !insufficientBalance;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ consensusId, reasoning });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to file dispute");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold mb-4">File Dispute</h3>

        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
          <p className="font-medium">Stake Required: {stakeAmount} credits</p>
          <p className="mt-1">
            Filing a dispute will deduct {stakeAmount} credits from your balance.
            If upheld, you receive your stake back plus a bonus. If dismissed,
            your stake is forfeited.
          </p>
          {!balanceLoading && balance !== null && (
            <p className="mt-1">
              Your balance: <span className="font-medium">{balance} credits</span>
            </p>
          )}
        </div>

        {insufficientBalance && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            <p className="font-medium">Insufficient credits</p>
            <p className="mt-1">
              You need at least {stakeAmount} credits to file a dispute.
              Your current balance is {balance} credits.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="reasoning"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Reasoning (50-2000 characters)
          </label>
          <textarea
            id="reasoning"
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-3 text-sm min-h-[120px] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Explain why you believe this consensus decision was incorrect..."
            maxLength={2000}
          />
          <p className="text-xs text-gray-500 mt-1">
            {reasoning.length}/2000 characters
            {reasoning.length > 0 && reasoning.length < 50 && (
              <span className="text-red-500 ml-2">
                Minimum 50 characters required
              </span>
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        {showConfirm ? (
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Filing..." : `Confirm: Stake ${stakeAmount} Credits`}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!isValid}
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              File Dispute
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
