/**
 * Queue names for BullMQ background jobs.
 */
export const QUEUE_NAMES = {
  GUARDRAIL_EVALUATION: "guardrail-evaluation",
  MISSION_EXPIRATION: "mission-expiration",
  EVIDENCE_AI_VERIFY: "evidence-ai-verify",
  // Sprint 9: Reputation & Impact
  REPUTATION_DECAY: "reputation-decay",
  FRAUD_SCORING: "fraud-scoring",
  METRICS_AGGREGATION: "metrics-aggregation",
  CLAIM_RECONCILIATION: "claim-reconciliation",
  // Sprint 11: Shadow Mode
  PEER_CONSENSUS: "peer-consensus",
  EVALUATION_TIMEOUT: "evaluation-timeout",
  CITY_METRICS: "city-metrics",
  // Sprint 12: Production Shift
  SPOT_CHECK: "spot-check",
  ECONOMIC_HEALTH: "economic-health",
  PRIVACY_PROCESSING: "privacy-processing",
  // Sprint 13: Phase 3 Integration
  PATTERN_AGGREGATION: "pattern-aggregation",
  // Sprint 16: Social Fabric Foundation
  CARE_MOMENTS: "care-moments",
  NOTIFICATION_RETENTION: "notification-retention",
  // Sprint 17: Community Identity & Visible Growth
  MILESTONE_DETECTION: "milestone-detection",
  INTELLIGENCE_REPORT: "intelligence-report",
  // Sprint 18: Cooperative Depth & Governance
  MENTORSHIP_EXPIRY: "mentorship-expiry",
  MODERATOR_ELIGIBILITY: "moderator-eligibility",
  CASE_STUDY_CURATION: "case-study-curation",
  ACHIEVEMENT_DETECTION: "achievement-detection",
  POWER_AUDIT: "power-audit",
  AGENT_FINGERPRINT: "agent-fingerprint",
  FEED_EVENT_PROCESSOR: "feed-event-processor",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
