/**
 * Milestone Type Constants (Sprint 17: Community Identity & Visible Growth)
 *
 * Defines milestone types and their tier thresholds for groups (domains and cities).
 */

export const MILESTONE_TYPES = [
  "missions_completed",
  "problems_resolved",
  "members_joined",
  "perfect_week",
  "cross_city_solution",
] as const;

export type MilestoneType = (typeof MILESTONE_TYPES)[number];

/** Tier thresholds per milestone type */
export const MILESTONE_THRESHOLDS: Record<MilestoneType, readonly number[]> = {
  missions_completed: [10, 25, 50, 100, 250],
  problems_resolved: [5, 10, 25, 50, 100],
  members_joined: [10, 25, 50, 100],
  perfect_week: [1, 5, 10, 25],
  cross_city_solution: [1, 5, 10],
} as const;

/** Human-readable labels for milestone types */
export const MILESTONE_LABELS: Record<MilestoneType, string> = {
  missions_completed: "Missions Completed",
  problems_resolved: "Problems Resolved",
  members_joined: "Members Joined",
  perfect_week: "Perfect Weeks",
  cross_city_solution: "Cross-City Solutions",
} as const;
