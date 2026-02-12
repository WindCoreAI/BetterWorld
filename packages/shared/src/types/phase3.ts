import { z } from "zod";

// ============================================================================
// GPS Validation
// ============================================================================

export const gpsCoordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().int().min(0).optional(),
});

export type GPSCoordinate = z.infer<typeof gpsCoordinateSchema>;

// ============================================================================
// Open311 Service Request
// ============================================================================

export const open311ServiceRequestSchema = z.object({
  service_request_id: z.string(),
  service_code: z.string(),
  service_name: z.string().optional(),
  status: z.string().optional(),
  description: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  long: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
  requested_datetime: z.string().optional(),
  updated_datetime: z.string().optional(),
  media_url: z.string().nullable().optional(),
});

export type Open311ServiceRequest = z.infer<typeof open311ServiceRequestSchema>;

export const open311ServiceSchema = z.object({
  service_code: z.string(),
  service_name: z.string(),
  description: z.string().optional(),
  type: z.string().optional(),
  group: z.string().optional(),
});

export type Open311Service = z.infer<typeof open311ServiceSchema>;

// ============================================================================
// City Config
// ============================================================================

export const cityConfigSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  endpoint: z.string().url(),
  apiKey: z.string().optional(),
  serviceCodeMapping: z.record(z.string(), z.object({
    domain: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  })),
  pollingIntervalMs: z.number().int().positive().default(15 * 60 * 1000),
  enabled: z.boolean().default(false),
});

export type CityConfig = z.infer<typeof cityConfigSchema>;

// ============================================================================
// Observation Input
// ============================================================================

export const createObservationSchema = z.object({
  observationType: z.enum(["photo", "video_still", "text_report", "audio_transcript"]),
  caption: z.string().min(1).max(500),
  gpsLat: z.number(),
  gpsLng: z.number(),
  gpsAccuracyMeters: z.number().int().min(0).optional(),
  capturedAt: z.string().datetime().optional(),
});

export type CreateObservationInput = z.infer<typeof createObservationSchema>;

export const createStandaloneObservationSchema = createObservationSchema.extend({
  problemTitle: z.string().min(1).max(500),
  domain: z.enum([
    "poverty_reduction", "education_access", "healthcare_improvement",
    "environmental_protection", "food_security", "mental_health_wellbeing",
    "community_building", "disaster_response", "digital_inclusion",
    "human_rights", "clean_water_sanitation", "sustainable_energy",
    "gender_equality", "biodiversity_conservation", "elder_care",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

export type CreateStandaloneObservationInput = z.infer<typeof createStandaloneObservationSchema>;

// ============================================================================
// Credit Transaction Input
// ============================================================================

export const agentCreditTransactionInputSchema = z.object({
  agentId: z.string().uuid(),
  amount: z.number().int(),
  transactionType: z.enum([
    "earn_validation",
    "earn_validation_local",
    "earn_validation_complexity",
    "earn_validation_domain",
    "earn_starter_grant",
    "spend_conversion",
  ]),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().max(50).optional(),
  description: z.string().optional(),
  idempotencyKey: z.string().max(64).optional(),
});

export type AgentCreditTransactionInput = z.infer<typeof agentCreditTransactionInputSchema>;

// ============================================================================
// Feature Flags
// ============================================================================

export const featureFlagSchema = z.object({
  PEER_VALIDATION_ENABLED: z.boolean().default(false),
  PEER_VALIDATION_TRAFFIC_PCT: z.number().int().min(0).max(100).default(0),
  SUBMISSION_COSTS_ENABLED: z.boolean().default(false),
  VALIDATION_REWARDS_ENABLED: z.boolean().default(false),
  HYPERLOCAL_INGESTION_ENABLED: z.boolean().default(false),
  CREDIT_CONVERSION_ENABLED: z.boolean().default(false),
  DYNAMIC_RATE_ADJUSTMENT_ENABLED: z.boolean().default(false),
  DISPUTES_ENABLED: z.boolean().default(false),
});

export type FeatureFlags = z.infer<typeof featureFlagSchema>;
export type FeatureFlagName = keyof FeatureFlags;

export const FEATURE_FLAG_NAMES: FeatureFlagName[] = [
  "PEER_VALIDATION_ENABLED",
  "PEER_VALIDATION_TRAFFIC_PCT",
  "SUBMISSION_COSTS_ENABLED",
  "VALIDATION_REWARDS_ENABLED",
  "HYPERLOCAL_INGESTION_ENABLED",
  "CREDIT_CONVERSION_ENABLED",
  "DYNAMIC_RATE_ADJUSTMENT_ENABLED",
  "DISPUTES_ENABLED",
];

export const FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  PEER_VALIDATION_ENABLED: false,
  PEER_VALIDATION_TRAFFIC_PCT: 0,
  SUBMISSION_COSTS_ENABLED: false,
  VALIDATION_REWARDS_ENABLED: false,
  HYPERLOCAL_INGESTION_ENABLED: false,
  CREDIT_CONVERSION_ENABLED: false,
  DYNAMIC_RATE_ADJUSTMENT_ENABLED: false,
  DISPUTES_ENABLED: false,
};
