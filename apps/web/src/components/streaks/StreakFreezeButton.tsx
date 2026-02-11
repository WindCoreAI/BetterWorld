"use client";

import { useState } from "react";

import { API_BASE, getHumanToken } from "../../lib/api";

interface StreakFreezeButtonProps {
  freezeAvailable: boolean;
  freezeCooldownEndsAt: string | null;
  currentStreak: number;
  onFreezeActivated?: () => void;
}

export function StreakFreezeButton({
  freezeAvailable,
  freezeCooldownEndsAt,
  currentStreak,
  onFreezeActivated,
}: StreakFreezeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFreeze = freezeAvailable && currentStreak > 0;
  const onCooldown = freezeCooldownEndsAt && new Date(freezeCooldownEndsAt) > new Date();

  const handleFreeze = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getHumanToken();
      const res = await fetch(`${API_BASE}/api/v1/streaks/me/freeze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message ?? "Failed to activate freeze");
      } else {
        onFreezeActivated?.();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleFreeze}
        disabled={!canFreeze || loading || !!onCooldown}
        className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
          canFreeze && !onCooldown
            ? "bg-sky-100 text-sky-700 hover:bg-sky-200"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
        }`}
      >
        {loading ? "..." : "Freeze Streak"}
      </button>
      {onCooldown && (
        <p className="text-xs text-charcoal-light mt-1">
          Cooldown until {new Date(freezeCooldownEndsAt!).toLocaleDateString()}
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
