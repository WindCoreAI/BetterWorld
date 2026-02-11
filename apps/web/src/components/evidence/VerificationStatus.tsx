"use client";

import { useEffect, useState } from "react";

interface VerificationStatusProps {
  evidenceId: string;
  initialStage?: string;
}

const STAGES = [
  { key: "pending", label: "Submitted" },
  { key: "ai_processing", label: "AI Reviewing" },
  { key: "peer_review", label: "Peer Review" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

export function VerificationStatus({
  evidenceId,
  initialStage = "pending",
}: VerificationStatusProps) {
  const [stage, setStage] = useState(initialStage);
  const [rewardAmount, setRewardAmount] = useState<number | null>(null);

  useEffect(() => {
    if (stage === "verified" || stage === "rejected") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/evidence/${evidenceId}/status`);
        if (res.ok) {
          const data = await res.json();
          setStage(data.data.verificationStage);
          if (data.data.rewardAmount) {
            setRewardAmount(data.data.rewardAmount);
          }
        }
      } catch {
        // Non-fatal polling error
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [evidenceId, stage]);

  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Verification Status</h3>
      <div className="flex items-center gap-2">
        {STAGES.filter((s) => s.key !== "rejected" || stage === "rejected").map((s, i) => {
          const isActive = s.key === stage;
          const isPast = i < currentIndex;
          const isRejected = s.key === "rejected" && stage === "rejected";

          return (
            <div key={s.key} className="flex items-center gap-1">
              <div
                className={`w-3 h-3 rounded-full ${
                  isRejected
                    ? "bg-red-500"
                    : isActive
                      ? "bg-blue-500"
                      : isPast
                        ? "bg-green-500"
                        : "bg-gray-300"
                }`}
              />
              <span
                className={`text-xs ${
                  isActive ? "font-medium text-gray-900" : "text-gray-500"
                }`}
              >
                {s.label}
              </span>
              {i < STAGES.length - 2 && <span className="text-gray-300 mx-1">→</span>}
            </div>
          );
        })}
      </div>
      {stage === "verified" && rewardAmount !== null && (
        <p className="text-sm text-green-600 font-medium">
          Reward: {rewardAmount} IT earned!
        </p>
      )}
    </div>
  );
}
