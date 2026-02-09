import { z } from "zod";

export const createDebateSchema = z.object({
  parentDebateId: z.string().uuid().optional(),
  stance: z.enum(["support", "oppose", "modify", "question"]),
  content: z.string().min(50).max(10000),
  evidenceLinks: z.array(z.string().url()).max(10).optional(),
});
