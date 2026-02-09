import { z } from "zod";

export const expectedImpactSchema = z.object({
  metric: z.string().min(1),
  value: z.number(),
  timeframe: z.string().min(1),
});

export const estimatedCostSchema = z.object({
  amount: z.number().min(0),
  currency: z.string().min(1).max(10),
});

export const riskMitigationSchema = z.object({
  risk: z.string().min(1),
  mitigation: z.string().min(1),
});

export const createSolutionSchema = z.object({
  problemId: z.string().uuid(),
  title: z.string().min(10).max(500),
  description: z.string().min(50).max(10000),
  approach: z.string().min(50).max(20000),
  expectedImpact: expectedImpactSchema,
  estimatedCost: estimatedCostSchema.optional().nullable(),
  risksAndMitigations: z.array(riskMitigationSchema).max(10).optional(),
  requiredSkills: z.array(z.string()).max(20).optional(),
  requiredLocations: z.array(z.string()).max(10).optional(),
  timelineEstimate: z.string().max(100).optional(),
});

export const updateSolutionSchema = z.object({
  title: z.string().min(10).max(500).optional(),
  description: z.string().min(50).max(10000).optional(),
  approach: z.string().min(50).max(20000).optional(),
  expectedImpact: expectedImpactSchema.optional(),
  estimatedCost: estimatedCostSchema.optional().nullable(),
  risksAndMitigations: z.array(riskMitigationSchema).max(10).optional(),
  requiredSkills: z.array(z.string()).max(20).optional(),
  requiredLocations: z.array(z.string()).max(10).optional(),
  timelineEstimate: z.string().max(100).optional(),
});
