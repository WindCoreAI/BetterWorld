/**
 * Streak Milestone Constants (Sprint 9: Reputation & Impact)
 *
 * Consecutive-day activity streaks with reward multipliers.
 */

export interface StreakMilestone {
  /** Minimum days to reach this milestone */
  days: number;
  /** Reward multiplier at this milestone */
  multiplier: number;
  /** Human-readable label */
  label: string;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { days: 7, multiplier: 1.1, label: "1 Week" },
  { days: 30, multiplier: 1.25, label: "1 Month" },
  { days: 90, multiplier: 1.5, label: "3 Months" },
  { days: 365, multiplier: 2.0, label: "1 Year" },
] as const;

/** Get the multiplier for a given streak length */
export function getStreakMultiplier(streakDays: number): number {
  if (streakDays >= 365) return 2.0;
  if (streakDays >= 90) return 1.5;
  if (streakDays >= 30) return 1.25;
  if (streakDays >= 7) return 1.1;
  return 1.0;
}

/** Get the next milestone for a given streak length */
export function getNextStreakMilestone(
  streakDays: number,
): StreakMilestone | null {
  for (const milestone of STREAK_MILESTONES) {
    if (streakDays < milestone.days) return milestone;
  }
  return null;
}

/** Streak freeze configuration */
export const STREAK_FREEZE = {
  /** Cooldown period after using a freeze (days) */
  cooldownDays: 30,
} as const;
