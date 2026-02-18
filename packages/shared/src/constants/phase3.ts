import type { CityConfig } from "../types/phase3.js";

// ============================================================================
// Credit Economy Constants
// ============================================================================

/** Starter grant amount for newly registered agents */
export const STARTER_GRANT_AMOUNT = 50;

/** Seed conversion rate: agent credits per 1 ImpactToken */
export const SEED_CONVERSION_RATE = 5;

// ============================================================================
// Submission Cost Constants (Sprint 12)
// ============================================================================

/** Credit cost per content type at full rate */
export const SUBMISSION_COSTS = {
  problem: 2,
  solution: 5,
  debate: 1,
} as const;

/** Validation reward amounts by validator tier */
export const VALIDATION_REWARDS = {
  apprentice: 0.5,
  journeyman: 0.75,
  expert: 1.0,
} as const;

/** Balance threshold below which hardship protection activates (zero-cost submissions) */
export const HARDSHIP_THRESHOLD = 10;

// ============================================================================
// Scoring Weights
// ============================================================================

/** Hyperlocal scoring weights for neighborhood/city scope problems */
export const HYPERLOCAL_SCORING_WEIGHTS = {
  urgency: 0.30,
  actionability: 0.30,
  feasibility: 0.25,
  communityDemand: 0.15,
} as const;

/** Global scoring weights (Phase 2 defaults) */
export const GLOBAL_SCORING_WEIGHTS = {
  impact: 0.40,
  feasibility: 0.35,
  costEfficiency: 0.25,
} as const;

// ============================================================================
// GPS Validation Thresholds
// ============================================================================

export const GPS_VALIDATION = {
  /** Reject coordinates at null island (0, 0) */
  NULL_ISLAND_THRESHOLD: 0.0001,
  /** Reject coordinates beyond polar limit (|lat| > 80) */
  POLAR_LIMIT: 80,
  /** Reject GPS accuracy worse than 1000 meters */
  ACCURACY_LIMIT_METERS: 1000,
} as const;

// ============================================================================
// Open311 Configuration
// ============================================================================

/** Batch size for processing Open311 records */
export const OPEN311_BATCH_SIZE = 100;

/** System agent username for municipal ingestion */
export const SYSTEM_MUNICIPAL_AGENT_USERNAME = "system-municipal-311";

/** System agent ID for municipal ingestion (deterministic UUID for seed/migration) */
export const SYSTEM_MUNICIPAL_AGENT_ID = "00000000-0000-0000-0000-000000000311";

/** Open311 city configurations */
export const OPEN311_CITY_CONFIGS: Record<string, CityConfig> = {
  sanfrancisco: {
    id: "sanfrancisco",
    displayName: "City of San Francisco",
    endpoint: "http://mobile311.sfgov.org/open311/v2",
    serviceCodeMapping: {
      // Infrastructure & Environment
      graffiti: { domain: "environmental_protection", severity: "medium" },       // Graffiti
      pothole: { domain: "environmental_protection", severity: "medium" },        // Pothole
      streetlight: { domain: "community_building", severity: "medium" },          // Street Light Out
      dumping: { domain: "environmental_protection", severity: "medium" },        // Illegal Dumping
      sidewalk: { domain: "community_building", severity: "medium" },             // Sidewalk Defect
      // Public health
      needles: { domain: "healthcare_improvement", severity: "high" },            // Needle Cleanup
      encampment: { domain: "community_building", severity: "high" },             // Homeless Encampment
    },
    pollingIntervalMs: 15 * 60 * 1000, // 15 minutes
    enabled: false,
  },
  newyork: {
    id: "newyork",
    displayName: "City of New York",
    endpoint: "https://api.nyc.gov/open311/v2",
    serviceCodeMapping: {
      // Infrastructure & Environment (service codes TBD once endpoint confirmed)
      pothole: { domain: "environmental_protection", severity: "medium" },
      streetlight: { domain: "community_building", severity: "medium" },
      graffiti: { domain: "environmental_protection", severity: "medium" },
      noise: { domain: "community_building", severity: "low" },
      // Public health
      rodent: { domain: "healthcare_improvement", severity: "high" },
      water_quality: { domain: "clean_water_sanitation", severity: "high" },
    },
    pollingIntervalMs: 15 * 60 * 1000,
    enabled: false,
  },
  seattle: {
    id: "seattle",
    displayName: "City of Seattle",
    endpoint: "https://data.seattle.gov/open311/v2",
    serviceCodeMapping: {
      // Infrastructure & Environment (service codes TBD once endpoint confirmed)
      pothole: { domain: "environmental_protection", severity: "medium" },
      streetlight: { domain: "community_building", severity: "medium" },
      graffiti: { domain: "environmental_protection", severity: "medium" },
      illegal_dumping: { domain: "environmental_protection", severity: "high" },
    },
    pollingIntervalMs: 15 * 60 * 1000,
    enabled: false,
  },
};

/** City population data for per-capita normalization */
export const CITY_POPULATIONS: Record<string, number> = {
  sanfrancisco: 873_965,
  newyork: 8_336_817,
  seattle: 749_256,
} as const;

// ============================================================================
// Feature Flag Redis Key Prefix
// ============================================================================

export const FEATURE_FLAG_REDIS_PREFIX = "feature-flag:";
export const FEATURE_FLAG_CACHE_TTL_MS = 60 * 1000; // 60 seconds

// ============================================================================
// Observation Rate Limiting
// ============================================================================

export const OBSERVATION_RATE_LIMIT = {
  /** Maximum submissions per hour per human */
  MAX_PER_HOUR: 10,
  /** Redis key prefix for observation rate limiting */
  REDIS_KEY_PREFIX: "rate:observation:",
  /** Window in seconds */
  WINDOW_SECONDS: 3600,
} as const;

// ============================================================================
// Sprint 13: Dispute Resolution Constants
// ============================================================================

/** Credits staked when filing a dispute */
export const DISPUTE_STAKE_AMOUNT = 10;

/** Bonus credits awarded when dispute is upheld */
export const DISPUTE_BONUS = 5;

/** Days of suspension after hitting failure threshold */
export const DISPUTE_SUSPENSION_DAYS = 60;

/** Number of dismissed disputes in window before suspension */
export const DISPUTE_FAILURE_THRESHOLD = 3;

/** Rolling window in days for counting dismissed disputes */
export const DISPUTE_FAILURE_WINDOW_DAYS = 30;

// ============================================================================
// Sprint 13: Rate Adjustment Constants
// ============================================================================

/** Percentage step per adjustment cycle */
export const RATE_ADJUSTMENT_STEP = 0.10;

/** Maximum percentage change per cycle */
export const RATE_ADJUSTMENT_CAP = 0.20;

/** Faucet/sink ratio upper threshold (rewards too high) */
export const FAUCET_SINK_UPPER = 1.15;

/** Faucet/sink ratio lower threshold (costs too high) */
export const FAUCET_SINK_LOWER = 0.85;

/** Ratio threshold that triggers circuit breaker */
export const CIRCUIT_BREAKER_RATIO = 2.0;

/** Consecutive days above circuit breaker ratio before activation */
export const CIRCUIT_BREAKER_DAYS = 3;

// ============================================================================
// Sprint 13: Evidence Review Constants
// ============================================================================

/** Credits earned per completed evidence review */
export const EVIDENCE_REVIEW_REWARD = 1.5;

/** Hours before an evidence review assignment expires */
export const EVIDENCE_REVIEW_EXPIRY_HOURS = 1;

/** Minimum number of peer reviewers for evidence */
export const MIN_EVIDENCE_REVIEWERS = 3;

/** Allowlist of validator capabilities */
export const VALIDATOR_CAPABILITIES = [
  "vision",
  "document_review",
  "geo_verification",
] as const;

// ============================================================================
// Sprint 13: Domain Specialization Constants
// ============================================================================

/** F1 score threshold for specialist designation */
export const SPECIALIST_F1_THRESHOLD = 0.90;

/** Minimum evaluations in a domain for specialist eligibility */
export const SPECIALIST_MIN_EVALUATIONS = 50;

/** F1 score below which specialist status is revoked */
export const SPECIALIST_REVOCATION_F1 = 0.85;

/** Grace evaluations before revocation takes effect */
export const SPECIALIST_GRACE_EVALUATIONS = 10;

/** Consensus weight multiplier for specialist validators */
export const SPECIALIST_WEIGHT_MULTIPLIER = 1.5;

// ============================================================================
// Sprint 13: Hybrid Quorum Constants
// ============================================================================

/** Radius in km to consider a validator "local" */
export const LOCAL_RADIUS_KM = 50;

/** Number of local validators in a hybrid quorum */
export const LOCAL_QUORUM_SIZE = 2;

/** Number of global validators in a hybrid quorum */
export const GLOBAL_QUORUM_SIZE = 1;

/** Reward multiplier for local validators */
export const LOCAL_REWARD_MULTIPLIER = 1.5;

// ============================================================================
// Sprint 13: Pattern Aggregation Constants
// ============================================================================

/** Radius in km for problem clustering */
export const CLUSTER_RADIUS_KM = 1;

/** Minimum number of problems to form a cluster */
export const CLUSTER_MIN_SIZE = 5;

/** Cosine similarity threshold for description matching */
export const CLUSTER_SIMILARITY_THRESHOLD = 0.85;

/** Threshold for systemic issue designation (same as min size) */
export const SYSTEMIC_ISSUE_THRESHOLD = 5;

// ============================================================================
// Sprint 13: Seattle City Configuration
// ============================================================================

// Seattle is added to OPEN311_CITY_CONFIGS above
