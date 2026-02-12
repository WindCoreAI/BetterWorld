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
  "earn_evidence_verified",
  "earn_peer_review",
  "earn_review_mission",
  "earn_conversion_received",
  // Spend (negative amounts)
  "spend_vote",
  "spend_circle",
  "spend_analytics",
  "spend_custom",
]);

// Sprint 8: Evidence verification enums
export const evidenceTypeEnum = pgEnum("evidence_type", [
  "photo",
  "video",
  "document",
  "text_report",
]);

export const evidenceVerificationStageEnum = pgEnum("evidence_verification_stage", [
  "pending",
  "ai_processing",
  "peer_review",
  "verified",
  "rejected",
  "appealed",
  "admin_review",
]);

export const peerReviewVerdictEnum = pgEnum("peer_review_verdict", [
  "approve",
  "reject",
]);

// Sprint 9: Reputation & Impact enums
export const reputationTierEnum = pgEnum("reputation_tier", [
  "newcomer",
  "contributor",
  "advocate",
  "leader",
  "champion",
]);

export const fraudActionEnum = pgEnum("fraud_action", [
  "flag_for_review",
  "auto_suspend",
  "clear_flag",
  "reset_score",
  "manual_suspend",
  "unsuspend",
]);

export const endorsementStatusEnum = pgEnum("endorsement_status", [
  "active",
  "revoked",
]);

export const portfolioVisibilityEnum = pgEnum("portfolio_visibility", [
  "public",
  "private",
]);

// Sprint 10: Phase 3 Foundation enums
export const validatorTierEnum = pgEnum("validator_tier", [
  "apprentice",
  "journeyman",
  "expert",
]);

export const consensusDecisionEnum = pgEnum("consensus_decision", [
  "approved",
  "rejected",
  "escalated",
  "expired",
]);

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "admin_review",
  "upheld",
  "overturned",
  "dismissed",
]);

export const geographicScopeEnum = pgEnum("geographic_scope", [
  "global",
  "country",
  "city",
  "neighborhood",
]);

export const observationTypeEnum = pgEnum("observation_type", [
  "photo",
  "video_still",
  "text_report",
  "audio_transcript",
]);

export const observationVerificationEnum = pgEnum("observation_verification", [
  "pending",
  "gps_verified",
  "vision_verified",
  "rejected",
  "fraud_flagged",
]);

export const reviewTypeEnum = pgEnum("review_type", [
  "evidence",
  "observation",
  "before_after",
]);

export const agentCreditTypeEnum = pgEnum("agent_credit_type", [
  "earn_validation",
  "earn_validation_local",
  "earn_validation_complexity",
  "earn_validation_domain",
  "earn_starter_grant",
  "spend_conversion",
]);
