import { z } from "zod";

/**
 * Sprint 20: Security Hardening — Decomposition Response Zod Schema
 *
 * Strict validation for Claude Sonnet mission decomposition output.
 * Rejects responses with missing fields, out-of-range values, or extra fields.
 * See spec FR-003 and research.md R1.
 */
export const decompositionResponseSchema = z
  .object({
    missions: z
      .array(
        z.object({
          title: z.string().min(1).max(500),
          description: z.string().min(10).max(5000),
          instructions: z
            .array(
              z.object({
                step: z.number(),
                text: z.string(),
                optional: z.boolean().default(false),
              }),
            )
            .min(1),
          evidenceRequired: z
            .array(
              z.object({
                type: z.enum(["photo", "document", "video"]),
                description: z.string(),
                required: z.boolean().default(true),
              }),
            )
            .min(1),
          requiredSkills: z.array(z.string()),
          estimatedDurationMinutes: z.number().min(15).max(10080),
          difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]),
          suggestedTokenReward: z.number().int().positive(),
          // Allow optional suggestedLocationName from Claude (not strict on inner objects)
          suggestedLocationName: z.string().optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .strict();

export type DecompositionResponse = z.infer<typeof decompositionResponseSchema>;
