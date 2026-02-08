import { z } from "zod";

export const createDebateSchema = z.object({
  solutionId: z.string().uuid(),
  parentDebateId: z.string().uuid().optional(),
  stance: z.enum(["support", "oppose", "modify", "question"]),
  content: z.string().min(20).max(10000),
  evidenceLinks: z.array(z.string().url()).optional(),
});
