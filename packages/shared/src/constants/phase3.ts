import type { CityConfig } from "../types/phase3.js";

// ============================================================================
// Credit Economy Constants
// ============================================================================

/** Starter grant amount for newly registered agents */
export const STARTER_GRANT_AMOUNT = 50;

/** Seed conversion rate: agent credits per 1 ImpactToken */
export const SEED_CONVERSION_RATE = 5;

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
  chicago: {
    id: "chicago",
    displayName: "City of Chicago",
    endpoint: "http://311api.cityofchicago.org/open311/v2",
    serviceCodeMapping: {
      // Infrastructure & Environment
      "4fd3b167e750846744000005": { domain: "environmental_protection", severity: "medium" }, // Graffiti Removal
      "4fd3b9bce750846c53000004": { domain: "environmental_protection", severity: "medium" }, // Pothole in Street
      "4ffa4c69601827691b000018": { domain: "clean_water_sanitation", severity: "high" },      // Water in Street
      "4fd3b656e750846c5300000b": { domain: "environmental_protection", severity: "low" },     // Tree Debris
      "4fd3b750e750846c53000010": { domain: "community_building", severity: "medium" },        // Street Light Out
      "4ffa971e601827691b000019": { domain: "environmental_protection", severity: "medium" },   // Fly Dumping
      // Public health
      "4fd3bbf8e750846c53000069": { domain: "healthcare_improvement", severity: "high" },      // Rodent Baiting
      "4fd3b9bce750846c53000049": { domain: "clean_water_sanitation", severity: "high" },      // Sewer Cave-in
    },
    pollingIntervalMs: 15 * 60 * 1000, // 15 minutes
    enabled: false,
  },
  portland: {
    id: "portland",
    displayName: "City of Portland",
    endpoint: "https://www.portlandoregon.gov/shared/cfm/open311.cfm",
    serviceCodeMapping: {
      // Generic mappings for Portland (service codes TBD once endpoint confirmed)
      graffiti: { domain: "environmental_protection", severity: "medium" },
      pothole: { domain: "environmental_protection", severity: "medium" },
      streetlight: { domain: "community_building", severity: "medium" },
      dumping: { domain: "environmental_protection", severity: "medium" },
    },
    pollingIntervalMs: 15 * 60 * 1000,
    enabled: false,
  },
};

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
