/**
 * Challenge Zod schemas (Sprint 18: Cooperative Depth & Governance)
 */
import { z } from "zod";

export const createChallengeSchema = z.object({
  challengeType: z.enum(["city_vs_city", "domain_sprint", "cross_pollination"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  groups: z.array(
    z.object({
      type: z.enum(["city", "domain"]),
      value: z.string().min(1).max(100),
    }),
  ).min(1),
  metric: z.string().min(1).max(50),
  targetValue: z.number().int().positive().optional(),
  startDate: z.string(),
  endDate: z.string(),
});

export const joinChallengeSchema = z.object({
  challengeId: z.string().uuid(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type JoinChallengeInput = z.infer<typeof joinChallengeSchema>;
