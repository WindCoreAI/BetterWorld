/**
 * Enhancement Zod schemas (Sprint 18: Cooperative Depth & Governance)
 *
 * Narratives, human solutions, human missions, feed, discover.
 */
import { z } from "zod";

const VALID_DOMAINS = [
  "poverty_reduction", "education_access", "healthcare_improvement",
  "environmental_protection", "food_security", "mental_health_wellbeing",
  "community_building", "disaster_response", "digital_inclusion",
  "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
] as const;

export const narrativeSchema = z.object({
  narrative: z.string().min(1).max(1000),
});

export const featureEndorsementSchema = z.object({
  isFeatured: z.boolean(),
});

export const humanSolutionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  estimatedCost: z.enum(["low", "medium", "high"]).optional(),
  estimatedTimeframe: z.string().max(200).optional(),
});

export const humanMissionProposalSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  domain: z.enum(VALID_DOMAINS),
  difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).default("intermediate"),
  estimatedDuration: z.string().max(200).optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().max(500).optional(),
  }).optional(),
});

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const discoverQuerySchema = z.object({
  domain: z.string().optional(),
  city: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type NarrativeInput = z.infer<typeof narrativeSchema>;
export type FeatureEndorsementInput = z.infer<typeof featureEndorsementSchema>;
export type HumanSolutionInput = z.infer<typeof humanSolutionSchema>;
export type HumanMissionProposalInput = z.infer<typeof humanMissionProposalSchema>;
export type FeedQueryInput = z.infer<typeof feedQuerySchema>;
export type DiscoverQueryInput = z.infer<typeof discoverQuerySchema>;
