/**
 * Leaderboard TypeScript Types (Sprint 9: Reputation & Impact)
 */
import type { z } from "zod";

import type {
  leaderboardTypeSchema,
  leaderboardQuerySchema,
  leaderboardEntrySchema,
  myRankSchema,
} from "../schemas/leaderboards.js";

export type LeaderboardType = z.infer<typeof leaderboardTypeSchema>;
export type LeaderboardFilter = z.infer<typeof leaderboardQuerySchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type MyRankResult = z.infer<typeof myRankSchema>;
