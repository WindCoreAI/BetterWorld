/**
 * Reputation Zod Schemas (Sprint 9: Reputation & Impact)
 */
import { z } from "zod";

export const reputationTierSchema = z.enum([
  "newcomer",
  "contributor",
  "advocate",
  "leader",
  "champion",
]);

export const reputationBreakdownSchema = z.object({
  missionQuality: z.number().min(0),
  peerAccuracy: z.number().min(0),
  streak: z.number().min(0),
  endorsements: z.number().min(0),
});

export const reputationScoreSchema = z.object({
  humanId: z.string().uuid(),
  totalScore: z.number().min(0),
  tier: reputationTierSchema,
  tierMultiplier: z.number().min(1),
  breakdown: reputationBreakdownSchema,
  nextTier: z
    .object({
      name: z.string(),
      threshold: z.number(),
      progress: z.number().min(0).max(100),
    })
    .nullable(),
  gracePeriod: z.object({
    active: z.boolean(),
    expiresAt: z.string().datetime().nullable(),
    previousTier: reputationTierSchema.nullable(),
  }),
  lastActivityAt: z.string().datetime().nullable(),
});

export const reputationHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  scoreBefore: z.number(),
  scoreAfter: z.number(),
  delta: z.number(),
  eventType: z.string(),
  eventSourceType: z.string().nullable(),
  tierBefore: reputationTierSchema.nullable(),
  tierAfter: reputationTierSchema.nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});

export const endorsementCreateSchema = z.object({
  toHumanId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export const tierDefinitionSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  minScore: z.number(),
  multiplier: z.number(),
  privileges: z.array(z.string()),
  humanCount: z.number().int().min(0),
});

export const gracePeriodSchema = z.object({
  active: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  previousTier: reputationTierSchema.nullable(),
});

export const reputationHistoryQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  event_type: z.string().optional(),
});
