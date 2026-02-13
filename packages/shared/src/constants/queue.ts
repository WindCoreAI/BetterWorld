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
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
