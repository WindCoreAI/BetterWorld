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
  // Sprint 16: Discussion content types for guardrail routing
  "discussion_thread",
  "discussion_reply",
  // Sprint 18: Cooperative Depth & Governance content types
  "circle_post",
  "help_offer_message",
  "help_request_note",
  "gratitude_narrative",
  "human_solution",
  "human_mission_proposal",
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
  // Sprint 18: Human-proposed missions start in pending_endorsement
  "pending_endorsement",
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
  // Sprint 16: Social Fabric care moment gifts
  "spend_cheer",
  "spend_celebrate",
  // Sprint 18: Cooperative Depth & Governance
  "earn_mentorship_bonus",
  "earn_mentee_first_mission",
  "earn_mentorship_completion",
  "earn_buddy_split",
  "earn_helper_reward",
  "spend_buddy_share",
  "spend_helper_share",
  "earn_teaching_reward",
  "earn_ambassador_welcome",
  "earn_case_study_contribution",
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
  // Sprint 12: Production Shift — submission costs
  "spend_submission_problem",
  "spend_submission_solution",
  "spend_submission_debate",
  // Sprint 13: Phase 3 Integration — disputes & evidence review
  "spend_dispute_stake",
  "earn_dispute_refund",
  "earn_dispute_bonus",
  "earn_evidence_review",
]);

// Sprint 12: Production Shift enums
export const photoSequenceTypeEnum = pgEnum("photo_sequence_type", [
  "before",
  "after",
  "standalone",
]);

export const privacyProcessingStatusEnum = pgEnum("privacy_processing_status", [
  "pending",
  "processing",
  "completed",
  "quarantined",
]);

export const routingDecisionEnum = pgEnum("routing_decision", [
  "layer_b",
  "peer_consensus",
]);

export const attestationStatusEnum = pgEnum("attestation_status", [
  "confirmed",
  "resolved",
  "not_found",
]);

// Sprint 13: Phase 3 Integration enums
export const evidenceReviewStatusEnum = pgEnum("evidence_review_status", [
  "pending",
  "completed",
  "expired",
]);

export const rateDirectionEnum = pgEnum("rate_direction", [
  "increase",
  "decrease",
  "none",
]);

// Sprint 16: Social Fabric Foundation enums
export const connectionStatusEnum = pgEnum("connection_status", [
  "pending",
  "accepted",
  "declined",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "streak_warning",
  "milestone",
  "cheer",
  "celebration",
  "comeback",
  "reply",
  "connection_request",
  "connection_accepted",
  "follow",
  // Sprint 17: Community Identity & Visible Growth
  "feedback",
  "milestone_celebration",
  "intelligence_report",
  // Sprint 18: Cooperative Depth & Governance
  "mentorship_request",
  "mentorship_accepted",
  "mentorship_completed",
  "mentorship_rating_prompt",
  "mentee_mission_completed",
  "buddy_invitation",
  "buddy_accepted",
  "buddy_declined",
  "help_offer_received",
  "help_offer_accepted",
  "help_offer_declined",
  "moderator_approved",
  "moderator_decision",
  "pathway_level_up",
  "challenge_started",
  "challenge_completed",
  "achievement_earned",
  "ambassador_assigned",
  "ambassador_welcome",
  "moderator_revoked",
  "mission_endorsed",
]);

export const discussionScopeTypeEnum = pgEnum("discussion_scope_type", [
  "domain",
  "city",
]);

export const careMomentTypeEnum = pgEnum("care_moment_type", [
  "cheer",
  "celebrate",
]);

// Sprint 17: Community Identity & Visible Growth enums
export const groupTypeEnum = pgEnum("group_type", ["domain", "city"]);

export const milestoneTypeEnum = pgEnum("milestone_type", [
  "missions_completed",
  "problems_resolved",
  "members_joined",
  "perfect_week",
  "cross_city_solution",
]);

export const feedbackTypeEnum = pgEnum("feedback_type", [
  "evidence_rejection",
  "review_disagreement",
  "high_performer_recognition",
]);

// Sprint 18: Cooperative Depth & Governance enums
export const mentorshipStatusEnum = pgEnum("mentorship_status", [
  "pending",
  "active",
  "completed",
  "terminated",
]);

export const buddyStatusEnum = pgEnum("buddy_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);

export const helpOfferStatusEnum = pgEnum("help_offer_status", [
  "pending",
  "accepted",
  "declined",
]);

export const moderatorActionTypeEnum = pgEnum("moderator_action_type", [
  "content_approved",
  "content_rejected",
  "content_escalated",
  "help_response",
  "newcomer_welcome",
]);

export const circleRoleEnum = pgEnum("circle_role", [
  "founder",
  "moderator",
  "member",
]);

export const circlePostTypeEnum = pgEnum("circle_post_type", [
  "discussion",
  "mission_share",
  "celebration",
]);

export const caseStudyStatusEnum = pgEnum("case_study_status", [
  "draft",
  "published",
  "archived",
]);

export const challengeTypeEnum = pgEnum("challenge_type", [
  "city_vs_city",
  "domain_sprint",
  "cross_pollination",
]);

export const challengeStatusEnum = pgEnum("challenge_status", [
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const pathwayLevelEnum = pgEnum("pathway_level", [
  "observer",
  "practitioner",
  "specialist_candidate",
  "specialist",
]);

export const cooperativeAchievementTypeEnum = pgEnum("cooperative_achievement_type", [
  "first_responders",
  "cross_city_bridge",
  "perfect_consensus",
  "domain_sweep",
  "growth_partners",
]);

export const feedEventTypeEnum = pgEnum("feed_event_type", [
  "problem_created",
  "solution_proposed",
  "mission_claimed",
  "evidence_submitted",
  "thread_created",
  "reply_created",
  "achievement_earned",
  "milestone_reached",
  "help_requested",
  "case_study_published",
  "challenge_started",
]);
