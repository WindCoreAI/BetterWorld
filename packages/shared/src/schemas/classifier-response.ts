import { z } from "zod";

/**
 * Sprint 20: Security Hardening — Classifier Response Zod Schema
 *
 * Strict validation for Layer B Claude classifier output.
 * Rejects responses with missing fields, out-of-range values, or extra fields.
 * See spec FR-001 and research.md R1.
 */
export const classifierResponseSchema = z
  .object({
    aligned_domain: z.string(),
    alignment_score: z.number().min(0).max(1),
    harm_risk: z.enum(["low", "medium", "high"]),
    feasibility: z.enum(["low", "medium", "high"]),
    quality: z.string(),
    decision: z.enum(["approve", "reject", "flag"]),
    reasoning: z.string(),
    solution_scores: z
      .object({
        impact: z.number().min(0).max(100),
        feasibility: z.number().min(0).max(100),
        cost_efficiency: z.number().min(0).max(100),
      })
      .optional(),
  })
  .strict();

export type ClassifierResponse = z.infer<typeof classifierResponseSchema>;
