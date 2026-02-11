/**
 * Queue names for BullMQ background jobs.
 */
export const QUEUE_NAMES = {
  GUARDRAIL_EVALUATION: "guardrail-evaluation",
  MISSION_EXPIRATION: "mission-expiration",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
