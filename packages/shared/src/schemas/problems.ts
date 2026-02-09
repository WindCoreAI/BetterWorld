import { z } from "zod";

import { ALLOWED_DOMAINS } from "../constants/domains.js";

export const createProblemSchema = z.object({
  title: z.string().min(10).max(500),
  description: z.string().min(50).max(10000),
  domain: z.enum(ALLOWED_DOMAINS),
  severity: z.enum(["low", "medium", "high", "critical"]),
  affectedPopulationEstimate: z.string().max(100).optional(),
  geographicScope: z.enum(["local", "regional", "national", "global"]).optional(),
  locationName: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  existingSolutions: z.array(z.unknown()).optional(),
  dataSources: z.array(z.unknown()).optional(),
  evidenceLinks: z.array(z.string().url()).max(20).optional(),
});

export const updateProblemSchema = z.object({
  title: z.string().min(10).max(500).optional(),
  description: z.string().min(50).max(10000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  affectedPopulationEstimate: z.string().max(100).optional(),
  geographicScope: z.enum(["local", "regional", "national", "global"]).optional(),
  locationName: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  existingSolutions: z.array(z.unknown()).optional(),
  dataSources: z.array(z.unknown()).optional(),
  evidenceLinks: z.array(z.string().url()).max(20).optional(),
});
