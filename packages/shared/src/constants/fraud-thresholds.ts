/**
 * Fraud Detection Threshold Constants (Sprint 9: Reputation & Impact)
 *
 * Score thresholds, pHash distance limits, and velocity windows.
 */

/** Fraud score thresholds */
export const FRAUD_THRESHOLDS = {
  /** Score at which account is flagged for review */
  flagForReview: 50,
  /** Score at which account is auto-suspended */
  autoSuspend: 150,
} as const;

/** Perceptual hash distance thresholds */
export const PHASH_THRESHOLDS = {
  /** Hamming distance <= this = duplicate */
  duplicate: 6,
  /** Hamming distance <= this = suspicious */
  suspicious: 10,
  /** Max possible hamming distance for 64-bit hash */
  maxDistance: 64,
} as const;

/** Velocity check windows */
export const VELOCITY_WINDOWS = {
  /** 10-minute window: flag if 15+ submissions */
  short: { windowMinutes: 10, threshold: 15 },
  /** 1-hour window: flag if 30+ submissions */
  medium: { windowMinutes: 60, threshold: 30 },
  /** 24-hour window: flag if 100+ submissions */
  long: { windowMinutes: 1440, threshold: 100 },
} as const;

/** Score deltas for each detection type */
export const FRAUD_SCORE_DELTAS = {
  /** Exact duplicate image (distance 0) */
  phashExactDuplicate: 30,
  /** Near-duplicate image (distance 1-6) */
  phashNearDuplicate: 15,
  /** Suspicious similarity (distance 7-10) */
  phashSuspicious: 5,
  /** Short-window velocity burst */
  velocityShortBurst: 20,
  /** Medium-window velocity burst */
  velocityMediumBurst: 10,
  /** Long-window velocity burst */
  velocityLongBurst: 5,
  /** GPS variance too low (always exact coordinates) */
  gpsClustering: 10,
  /** Approval rate > 95% with 10+ submissions */
  approvalAnomaly: 10,
  /** Submissions at exact intervals */
  timingPattern: 10,
} as const;

/** Statistical profiling thresholds */
export const STATISTICAL_THRESHOLDS = {
  /** Minimum GPS variance (latitude) - below this is suspicious */
  minGpsVarianceLat: 0.001,
  /** Minimum GPS variance (longitude) - below this is suspicious */
  minGpsVarianceLng: 0.001,
  /** Approval rate threshold - above this is suspicious */
  maxApprovalRate: 0.95,
  /** Minimum submissions needed for statistical analysis */
  minSubmissionsForAnalysis: 10,
} as const;
