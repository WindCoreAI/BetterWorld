/**
 * Leaderboard Zod Schemas (Sprint 9: Reputation & Impact)
 */
import { z } from "zod";

export const leaderboardTypeSchema = z.enum([
  "reputation",
  "impact",
  "tokens",
  "missions",
]);

export const leaderboardPeriodSchema = z.enum(["alltime", "month", "week"]);

export const leaderboardQuerySchema = z.object({
  type: leaderboardTypeSchema.optional(),
  period: leaderboardPeriodSchema.default("alltime"),
  domain: z.string().optional(),
  location_scope: z.string().default("global"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().min(0),
  humanId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  score: z.number(),
  tier: z.string().optional(),
});

export const myRankSchema = z.object({
  rank: z.number().int().min(0),
  score: z.number(),
  total: z.number().int(),
  percentile: z.number().min(0).max(100),
  context: z.array(leaderboardEntrySchema),
});
