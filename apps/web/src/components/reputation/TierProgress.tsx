"use client";

interface TierProgressProps {
  currentTier: string;
  nextTier: { name: string; threshold: number; progress: number } | null;
  totalScore: number;
}

export function TierProgress({ currentTier, nextTier, totalScore }: TierProgressProps) {
  if (!nextTier) {
    return (
      <div className="bg-white rounded-xl shadow-neu-sm p-4">
        <p className="text-sm text-charcoal-light">
          You've reached the highest tier — <span className="font-semibold capitalize text-amber-600">{currentTier}</span>!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-4">
      <div className="flex justify-between text-sm mb-2">
        <span className="capitalize font-medium text-charcoal">{currentTier}</span>
        <span className="capitalize font-medium text-charcoal-light">{nextTier.name}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
        <div
          className="bg-terracotta h-3 rounded-full transition-all"
          style={{ width: `${nextTier.progress}%` }}
        />
      </div>
      <p className="text-xs text-charcoal-light text-center">
        {totalScore.toFixed(0)} / {nextTier.threshold} ({nextTier.progress.toFixed(1)}%)
      </p>
    </div>
  );
}
