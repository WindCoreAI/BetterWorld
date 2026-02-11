"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface MissionClaimButtonProps {
  missionId: string;
  slotsAvailable: number;
  isClaimed?: boolean;
}

export default function MissionClaimButton({ missionId, slotsAvailable, isClaimed }: MissionClaimButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (isClaimed) {
    return <span className="rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-800">Already Claimed</span>;
  }

  if (slotsAvailable <= 0) {
    return <span className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">Fully Claimed</span>;
  }

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/missions/${missionId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setError(data.error?.message || "Mission is fully claimed");
        else if (res.status === 403) setError(data.error?.message || "Max 3 active missions reached");
        else setError(data.error?.message || "Failed to claim mission");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleClaim} disabled={loading} className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "Claiming..." : "Claim Mission"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
