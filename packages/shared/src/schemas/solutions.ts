import { z } from "zod";

export const createSolutionSchema = z.object({
  problemId: z.string().uuid(),
  title: z.string().min(10).max(500),
  description: z.string().min(50).max(10000),
  approach: z.string().min(50).max(20000),
  expectedImpact: z.record(z.unknown()),
  estimatedCost: z.record(z.unknown()).optional(),
  risksAndMitigations: z.array(z.unknown()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  requiredLocations: z.array(z.string()).optional(),
  timelineEstimate: z.string().max(100).optional(),
});
