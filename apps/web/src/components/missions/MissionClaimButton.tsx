"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getHumanToken } from "@/lib/api";
import { missionsApi } from "@/lib/humanApi";
import { rememberReturnTo } from "@/lib/returnTo";

interface MissionClaimButtonProps {
  missionId: string;
  slotsAvailable: number;
  isClaimed?: boolean;
  /** Called after a successful claim so the page can show the claim and the next step. */
  onClaimed?: () => void;
}

export default function MissionClaimButton({ missionId, slotsAvailable, isClaimed, onClaimed }: MissionClaimButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null until we have looked at the browser's session (avoids a flash of the wrong button)
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(!!getHumanToken());
  }, []);

  if (isClaimed) {
    return <span className="rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-800">Already Claimed</span>;
  }

  if (slotsAvailable <= 0) {
    return <span className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">Fully Claimed</span>;
  }

  if (signedIn === false) {
    // Bring them back to this mission once they are signed in (see lib/returnTo).
    const remember = () => rememberReturnTo(`/missions/${missionId}`);
    return (
      <div>
        <Link
          href="/auth/human/login"
          onClick={remember}
          className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Sign in to claim this mission
        </Link>
        <p className="mt-2 text-center text-sm text-gray-500">
          New here?{" "}
          <Link href="/auth/human/register" onClick={remember} className="text-blue-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    );
  }

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await missionsApi.claim(missionId);
      if (!res.ok) {
        setError(res.error?.message || "Failed to claim mission");
        return;
      }
      onClaimed?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClaim}
        disabled={loading || signedIn === null}
        className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Claiming..." : "Claim Mission"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
