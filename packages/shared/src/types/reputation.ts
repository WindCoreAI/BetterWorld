/**
 * Reputation TypeScript Types (Sprint 9: Reputation & Impact)
 */
import type { z } from "zod";

import type {
  reputationScoreSchema,
  reputationBreakdownSchema,
  reputationTierSchema,
  reputationHistoryEntrySchema,
  endorsementCreateSchema,
  gracePeriodSchema,
} from "../schemas/reputation.js";

export type ReputationTier = z.infer<typeof reputationTierSchema>;
export type ReputationBreakdown = z.infer<typeof reputationBreakdownSchema>;
export type ReputationScore = z.infer<typeof reputationScoreSchema>;
export type ReputationHistoryEntry = z.infer<
  typeof reputationHistoryEntrySchema
>;
export type EndorsementCreate = z.infer<typeof endorsementCreateSchema>;
export type GracePeriod = z.infer<typeof gracePeriodSchema>;

export interface Endorsement {
  id: string;
  fromHumanId: string;
  toHumanId: string;
  reason: string;
  status: "active" | "revoked";
  createdAt: string;
}
