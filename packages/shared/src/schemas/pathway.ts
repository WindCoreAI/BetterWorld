/**
 * Pathway Zod schemas (Sprint 18: Cooperative Depth & Governance)
 */
import { z } from "zod";

const VALID_DOMAINS = [
  "poverty_reduction", "education_access", "healthcare_improvement",
  "environmental_protection", "food_security", "mental_health_wellbeing",
  "community_building", "disaster_response", "digital_inclusion",
  "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
] as const;

export const enrollPathwaySchema = z.object({
  domain: z.enum(VALID_DOMAINS),
});

export const markCaseStudyReadSchema = z.object({
  caseStudyId: z.string().uuid(),
});

export type EnrollPathwayInput = z.infer<typeof enrollPathwaySchema>;
export type MarkCaseStudyReadInput = z.infer<typeof markCaseStudyReadSchema>;
