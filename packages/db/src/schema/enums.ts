import { pgEnum } from "drizzle-orm/pg-core";

export const problemDomainEnum = pgEnum("problem_domain", [
  "poverty_reduction",
  "education_access",
  "healthcare_improvement",
  "environmental_protection",
  "food_security",
  "mental_health_wellbeing",
  "community_building",
  "disaster_response",
  "digital_inclusion",
  "human_rights",
  "clean_water_sanitation",
  "sustainable_energy",
  "gender_equality",
  "biodiversity_conservation",
  "elder_care",
]);

export const severityLevelEnum = pgEnum("severity_level", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const problemStatusEnum = pgEnum("problem_status", [
  "active",
  "being_addressed",
  "resolved",
  "archived",
]);

export const solutionStatusEnum = pgEnum("solution_status", [
  "proposed",
  "debating",
  "ready_for_action",
  "in_progress",
  "completed",
  "abandoned",
]);

export const guardrailStatusEnum = pgEnum("guardrail_status", [
  "pending",
  "approved",
  "rejected",
  "flagged",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "pending",
  "claimed",
  "verified",
]);

export const entityTypeEnum = pgEnum("entity_type", ["agent", "human"]);

// Guardrails enums
export const contentTypeEnum = pgEnum("content_type", [
  "problem",
  "solution",
  "debate",
  "mission",
]);

export const guardrailDecisionEnum = pgEnum("guardrail_decision", [
  "approved",
  "flagged",
  "rejected",
]);

export const flaggedContentStatusEnum = pgEnum("flagged_content_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const adminDecisionEnum = pgEnum("admin_decision", [
  "approve",
  "reject",
]);

export const patternSeverityEnum = pgEnum("pattern_severity", [
  "high",
  "critical",
]);

// Sprint 7: Mission marketplace enums
export const missionStatusEnum = pgEnum("mission_status", [
  "open",
  "claimed",
  "in_progress",
  "submitted",
  "verified",
  "expired",
  "archived",
]);

export const difficultyLevelEnum = pgEnum("difficulty_level", [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
]);

export const missionClaimStatusEnum = pgEnum("mission_claim_status", [
  "active",
  "submitted",
  "verified",
  "abandoned",
  "released",
]);

// Sprint 6: Token transaction types
export const transactionTypeEnum = pgEnum("transaction_type", [
  // Earn (positive amounts)
  "earn_orientation",
  "earn_mission",
  "earn_reward",
  "earn_bonus",
  "earn_referral",
  // Spend (negative amounts)
  "spend_vote",
  "spend_circle",
  "spend_analytics",
  "spend_custom",
]);
