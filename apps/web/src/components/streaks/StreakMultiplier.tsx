"use client";

interface StreakMultiplierProps {
  multiplier: number;
}

export function StreakMultiplier({ multiplier }: StreakMultiplierProps) {
  const isActive = multiplier > 1.0;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
        isActive ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {multiplier}x streak
    </span>
  );
}
