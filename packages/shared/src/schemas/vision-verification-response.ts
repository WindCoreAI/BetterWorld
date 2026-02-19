import { z } from "zod";

/**
 * Sprint 20: Security Hardening — Vision Verification Response Zod Schema
 *
 * Strict validation for Claude Vision evidence verification output.
 * Rejects responses with missing fields, out-of-range values, or extra fields.
 * See spec FR-002 and research.md R1.
 */
export const visionVerificationResponseSchema = z
  .object({
    relevanceScore: z.number().min(0).max(1),
    gpsPlausibility: z.number().min(0).max(1),
    timestampPlausibility: z.number().min(0).max(1),
    authenticityScore: z.number().min(0).max(1),
    requirementChecklist: z.array(
      z.object({
        requirement: z.string(),
        met: z.boolean(),
      }),
    ),
    overallConfidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })
  .strict();

export type VisionVerificationResponse = z.infer<typeof visionVerificationResponseSchema>;
