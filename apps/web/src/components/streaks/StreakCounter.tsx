"use client";

interface StreakCounterProps {
  currentStreak: number;
  longestStreak: number;
  nextMilestone: { days: number; multiplier: number } | null;
}

export function StreakCounter({ currentStreak, longestStreak, nextMilestone }: StreakCounterProps) {
  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-charcoal">Activity Streak</h3>
        <span className="text-3xl font-bold text-terracotta">{currentStreak}</span>
      </div>
      <p className="text-sm text-charcoal-light mb-3">
        {currentStreak === 1 ? "day" : "days"} in a row
      </p>
      <div className="flex justify-between text-xs text-charcoal-light">
        <span>Longest: {longestStreak} days</span>
        {nextMilestone && (
          <span>Next: {nextMilestone.days}d ({nextMilestone.multiplier}x)</span>
        )}
      </div>
    </div>
  );
}
