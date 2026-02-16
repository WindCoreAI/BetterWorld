/**
 * Feedback Schemas (Sprint 17: Community Identity & Visible Growth)
 */
import { z } from "zod";

/** Improvement tip structure in review feedback */
export const improvementTipSchema = z.object({
  tip: z.string(),
  category: z.string(),
});

export type ImprovementTip = z.infer<typeof improvementTipSchema>;

/** Feedback read action */
export const feedbackReadSchema = z.object({
  id: z.string().uuid(),
});

export type FeedbackReadInput = z.infer<typeof feedbackReadSchema>;

/** Feedback list query params */
export const feedbackListQuerySchema = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  type: z
    .enum(["evidence_rejection", "review_disagreement", "high_performer_recognition"])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type FeedbackListQuery = z.infer<typeof feedbackListQuerySchema>;
