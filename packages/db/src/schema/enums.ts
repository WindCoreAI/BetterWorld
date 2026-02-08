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
