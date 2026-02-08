import { z } from "zod";

// Content type enum
export const contentTypeSchema = z.enum(["problem", "solution", "debate"]);

// Guardrail decision enum
export const guardrailDecisionSchema = z.enum(["approved", "flagged", "rejected"]);

// Layer A result schema
export const layerAResultSchema = z.object({
  passed: z.boolean(),
  forbiddenPatterns: z.array(z.string()),
  executionTimeMs: z.number().int().nonnegative(),
});

// Layer B result schema
export const layerBResultSchema = z.object({
  alignedDomain: z.string().min(1).max(50),
  alignmentScore: z.number().min(0).max(1),
  harmRisk: z.enum(["low", "medium", "high"]),
  feasibility: z.enum(["low", "medium", "high"]),
  quality: z.string(),
  decision: z.enum(["approve", "flag", "reject"]),
  reasoning: z.string().min(10),
});

// Evaluation request schema (POST /api/v1/guardrails/evaluate)
export const evaluationRequestSchema = z.object({
  contentType: contentTypeSchema,
  contentId: z.string().uuid(),
  content: z.record(z.unknown()), // Flexible content object
});

// Evaluation response schema (202 Accepted)
export const evaluationResponseSchema = z.object({
  evaluationId: z.string().uuid(),
  contentId: z.string().uuid(),
  status: z.literal("pending"),
  queuePosition: z.number().int().nonnegative(),
});

// Evaluation status response schema (GET /api/v1/guardrails/status/:id)
export const evaluationStatusResponseSchema = z.discriminatedUnion("status", [
  // Pending
  z.object({
    evaluationId: z.string().uuid(),
    status: z.literal("pending"),
    startedAt: z.string().datetime(),
    elapsedSeconds: z.number().nonnegative(),
  }),
  // Completed
  z.object({
    evaluationId: z.string().uuid(),
    status: z.literal("completed"),
    finalDecision: guardrailDecisionSchema,
    alignmentScore: z.number().min(0).max(1).nullable(),
    alignmentDomain: z.string().nullable(),
    layerAResult: layerAResultSchema,
    layerBResult: layerBResultSchema.nullable(),
    cacheHit: z.boolean(),
    completedAt: z.string().datetime(),
    evaluationDurationMs: z.number().int().nonnegative(),
  }),
]);

// Flagged content list query params
export const flaggedContentListParamsSchema = z.object({
  status: z
    .enum(["pending_review", "approved", "rejected", "all"])
    .default("pending_review"),
  contentType: z.enum(["problem", "solution", "debate", "all"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Admin review decision request schema
export const adminReviewDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().min(10).max(2000),
});

// Trust tier thresholds
export const trustTierThresholdsSchema = z.object({
  autoApprove: z.number().min(0).max(1),
  autoFlagMin: z.number().min(0).max(1),
  autoRejectMax: z.number().min(0).max(1),
});

// Export type inference helpers
export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;
export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;
export type EvaluationStatusResponse = z.infer<typeof evaluationStatusResponseSchema>;
export type FlaggedContentListParams = z.infer<typeof flaggedContentListParamsSchema>;
export type AdminReviewDecision = z.infer<typeof adminReviewDecisionSchema>;
export type TrustTierThresholds = z.infer<typeof trustTierThresholdsSchema>;
