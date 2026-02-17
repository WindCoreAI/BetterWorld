/**
 * Buddy & Help Zod schemas (Sprint 18: Cooperative Depth & Governance)
 */
import { z } from "zod";

export const inviteBuddySchema = z.object({
  buddyHumanId: z.string().uuid(),
});

export const helpOfferSchema = z.object({
  message: z.string().min(1).max(500),
});

export const helpRequestSchema = z.object({
  helpRequested: z.boolean(),
  helpRequestNote: z.string().max(500).optional(),
});

export type InviteBuddyInput = z.infer<typeof inviteBuddySchema>;
export type HelpOfferInput = z.infer<typeof helpOfferSchema>;
export type HelpRequestInput = z.infer<typeof helpRequestSchema>;
