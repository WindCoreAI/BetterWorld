/**
 * Consensus Configuration Constants (Sprint 11 — T019)
 *
 * Tier weights, quorum size, and threshold configuration for peer consensus.
 * Configurable via environment variables.
 */

/** Tier weights for weighted voting */
export const TIER_WEIGHTS = {
  apprentice: 1.0,
  journeyman: 1.5,
  expert: 2.0,
} as const;

/** Minimum evaluations to form a quorum */
export const QUORUM_SIZE = parseInt(process.env.PEER_CONSENSUS_QUORUM_SIZE || "3", 10);

/** Number of validators to over-assign to ensure quorum */
export const OVER_ASSIGN_COUNT = parseInt(process.env.PEER_CONSENSUS_OVER_ASSIGN || "6", 10);

/** Evaluation expiry in minutes from assignment */
export const EXPIRY_MINUTES = parseInt(process.env.PEER_CONSENSUS_EXPIRY_MINUTES || "30", 10);

/** Threshold for consensus to be "approved" */
export const APPROVE_THRESHOLD = parseFloat(process.env.PEER_CONSENSUS_APPROVE_THRESHOLD || "0.67");

/** Threshold for consensus to be "rejected" */
export const REJECT_THRESHOLD = parseFloat(process.env.PEER_CONSENSUS_REJECT_THRESHOLD || "0.67");

/** Daily evaluation limit per validator */
export const DAILY_EVALUATION_LIMIT = 10;

/** F1 score thresholds for tier promotion/demotion */
export const TIER_THRESHOLDS_F1 = {
  /** Apprentice to journeyman: F1 >= 0.85 AND total_evaluations >= 50 */
  apprenticeToJourneyman: { f1: 0.85, minEvaluations: 50 },
  /** Journeyman to expert: F1 >= 0.92 AND total_evaluations >= 200 */
  journeymanToExpert: { f1: 0.92, minEvaluations: 200 },
  /** Expert demotion: F1 < 0.92 AND 30+ evaluations since last change */
  expertDemotion: { f1: 0.92, minEvalsSinceChange: 30 },
  /** Journeyman demotion: F1 < 0.85 AND 30+ evaluations since last change */
  journeymanDemotion: { f1: 0.85, minEvalsSinceChange: 30 },
} as const;

/** Rolling window size for F1 computation */
export const F1_ROLLING_WINDOW = 100;
