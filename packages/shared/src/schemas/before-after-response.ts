import { z } from "zod";

/**
 * Sprint 20: Security Hardening — Before/After Comparison Response Zod Schema
 *
 * Strict validation for Claude Vision before/after comparison output.
 * Rejects responses with missing fields, out-of-range values, or extra fields.
 * See spec FR-002b and research.md R1.
 */
export const beforeAfterResponseSchema = z
  .object({
    improvementScore: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })
  .strict();

export type BeforeAfterResponse = z.infer<typeof beforeAfterResponseSchema>;
