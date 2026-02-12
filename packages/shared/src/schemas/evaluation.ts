/**
 * Evaluation Zod Schemas (Sprint 11)
 *
 * Validation schemas for evaluation request/response at API boundaries.
 */
import { z } from "zod";

// ============================================================================
// Evaluation Response Schema
// ============================================================================

export const peerEvaluationResponseSchema = z.object({
  recommendation: z.enum(["approved", "flagged", "rejected"]),
  confidence: z.number().min(0).max(1),
  scores: z.object({
    domainAlignment: z.number().int().min(1).max(5),
    factualAccuracy: z.number().int().min(1).max(5),
    impactPotential: z.number().int().min(1).max(5),
  }),
  reasoning: z.string().min(50).max(2000),
  safetyFlagged: z.boolean().default(false),
});

export type PeerEvaluationResponseInput = z.infer<typeof peerEvaluationResponseSchema>;

// ============================================================================
// Evaluation Pending Query Schema
// ============================================================================

export const evaluationPendingQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type EvaluationPendingQuery = z.infer<typeof evaluationPendingQuerySchema>;

// ============================================================================
// Home Regions Schema
// ============================================================================

export const homeRegionSchema = z.object({
  name: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const homeRegionsSchema = z.object({
  homeRegions: z.array(homeRegionSchema).min(0).max(3),
});

export type HomeRegionsInput = z.infer<typeof homeRegionsSchema>;
