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
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
