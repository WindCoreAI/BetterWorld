/**
 * Fraud Detection Zod Schemas (Sprint 9: Reputation & Impact)
 */
import { z } from "zod";

export const fraudStatusSchema = z.enum(["clean", "flagged", "suspended"]);

export const fraudActionTypeSchema = z.enum([
  "clear_flag",
  "reset_score",
  "manual_suspend",
  "unsuspend",
]);

export const fraudScoreSchema = z.object({
  humanId: z.string().uuid(),
  totalScore: z.number().int().min(0),
  phashScore: z.number().int().min(0),
  velocityScore: z.number().int().min(0),
  statisticalScore: z.number().int().min(0),
  status: fraudStatusSchema,
  flaggedAt: z.string().datetime().nullable(),
  suspendedAt: z.string().datetime().nullable(),
});

export const fraudEventSchema = z.object({
  id: z.string().uuid(),
  humanId: z.string().uuid(),
  evidenceId: z.string().uuid().nullable(),
  detectionType: z.string(),
  scoreDelta: z.number().int(),
  details: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const fraudAdminActionSchema = z.object({
  action: fraudActionTypeSchema,
  reason: z.string().min(10),
});

export const fraudQueueQuerySchema = z.object({
  status: z.enum(["flagged", "suspended", "all"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z
    .enum(["score_desc", "flagged_at_desc"])
    .default("score_desc"),
});
