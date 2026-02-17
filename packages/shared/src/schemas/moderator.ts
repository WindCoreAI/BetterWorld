/**
 * Moderator Zod schemas (Sprint 18: Cooperative Depth & Governance)
 */
import { z } from "zod";

export const moderatorDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "escalated"]),
  reason: z.string().max(2000).optional(),
});

export const moderatorApprovalSchema = z.object({
  domains: z.array(z.string()).min(1).max(15),
});

export type ModeratorDecisionInput = z.infer<typeof moderatorDecisionSchema>;
export type ModeratorApprovalInput = z.infer<typeof moderatorApprovalSchema>;
