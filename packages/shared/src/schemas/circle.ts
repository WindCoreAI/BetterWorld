/**
 * Circle Zod schemas (Sprint 18: Cooperative Depth & Governance)
 */
import { z } from "zod";

const VALID_DOMAINS = [
  "poverty_reduction", "education_access", "healthcare_improvement",
  "environmental_protection", "food_security", "mental_health_wellbeing",
  "community_building", "disaster_response", "digital_inclusion",
  "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
] as const;

export const createCircleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  domain: z.enum(VALID_DOMAINS).optional(),
});

export const circlePostSchema = z.object({
  content: z.string().min(1).max(2000),
  postType: z.enum(["discussion", "celebration"]).default("discussion"),
});

export const shareCircleMissionSchema = z.object({
  missionId: z.string().uuid(),
});

export type CreateCircleInput = z.infer<typeof createCircleSchema>;
export type CirclePostInput = z.infer<typeof circlePostSchema>;
export type ShareCircleMissionInput = z.infer<typeof shareCircleMissionSchema>;
