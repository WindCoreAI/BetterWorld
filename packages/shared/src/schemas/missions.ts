import { z } from "zod";

import { ALLOWED_DOMAINS } from "../constants/domains.js";

export const instructionStepSchema = z.object({
  step: z.number().int().positive(),
  text: z.string().min(1).max(2000),
  optional: z.boolean().default(false),
});

export const evidenceRequirementSchema = z.object({
  type: z.enum(["photo", "document", "video"]),
  description: z.string().min(1).max(500),
  required: z.boolean().default(true),
});

const createMissionBaseSchema = z.object({
  solutionId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(10).max(5000),
  instructions: z.array(instructionStepSchema).min(1).max(50),
  evidenceRequired: z.array(evidenceRequirementSchema).min(1).max(20),
  requiredSkills: z.array(z.string().min(1).max(100)).max(20).default([]),
  requiredLocationName: z.string().max(200).optional(),
  requiredLatitude: z.number().min(-90).max(90).optional(),
  requiredLongitude: z.number().min(-180).max(180).optional(),
  locationRadiusKm: z.number().int().min(1).max(200).default(5),
  estimatedDurationMinutes: z.number().int().min(15).max(10080),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced", "expert"])
    .default("intermediate"),
  missionType: z.string().max(50).optional(),
  tokenReward: z.number().int().positive(),
  bonusForQuality: z.number().int().min(0).default(0),
  maxClaims: z.number().int().min(1).default(1),
  expiresAt: z.string().datetime(),
  domain: z.enum(ALLOWED_DOMAINS),
});

export const createMissionSchema = createMissionBaseSchema.refine(
  (data) => {
    const hasLat = data.requiredLatitude !== undefined;
    const hasLng = data.requiredLongitude !== undefined;
    return hasLat === hasLng;
  },
  {
    message:
      "Both requiredLatitude and requiredLongitude must be provided together",
    path: ["requiredLatitude"],
  }
);

export const updateMissionSchema = createMissionBaseSchema
  .omit({ solutionId: true })
  .partial();

export const missionListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  domain: z.string().optional(),
  skills: z.string().optional(),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced", "expert"])
    .optional(),
  status: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().int().min(1).max(200).optional(),
  nearMe: z.enum(["true", "false"]).optional(),
  minReward: z.coerce.number().int().min(0).optional(),
  maxReward: z.coerce.number().int().optional(),
  maxDuration: z.coerce.number().int().optional(),
  sort: z.enum(["createdAt", "tokenReward", "distance"]).default("createdAt"),
});

export const updateClaimSchema = z.object({
  progressPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(5000).optional(),
  abandon: z.boolean().optional(),
}).refine(
  (data) => !(data.abandon && data.progressPercent !== undefined),
  { message: "Cannot set progressPercent when abandoning a claim", path: ["progressPercent"] },
);
