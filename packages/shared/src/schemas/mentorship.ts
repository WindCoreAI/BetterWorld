/**
 * Mentorship Zod schemas (Sprint 18: Cooperative Depth & Governance)
 */
import { z } from "zod";

export const createMentorshipSchema = z.object({
  mentorHumanId: z.string().uuid(),
});

export const rateMentorshipSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

export const mentorshipResponseSchema = z.object({
  id: z.string().uuid(),
  mentorHumanId: z.string().uuid(),
  menteeHumanId: z.string().uuid(),
  domain: z.string(),
  status: z.enum(["pending", "active", "completed", "terminated"]),
  mentorAccepted: z.boolean(),
  menteeAccepted: z.boolean(),
  missionsGuided: z.number().int(),
  tokensEarnedByMentor: z.number().int(),
  mentorRating: z.number().int().min(1).max(5).nullable(),
  menteeRating: z.number().int().min(1).max(5).nullable(),
  expiresAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type CreateMentorshipInput = z.infer<typeof createMentorshipSchema>;
export type RateMentorshipInput = z.infer<typeof rateMentorshipSchema>;
export type MentorshipResponse = z.infer<typeof mentorshipResponseSchema>;
