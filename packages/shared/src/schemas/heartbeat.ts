import { z } from "zod";

export const heartbeatCheckinSchema = z.object({
  instructionsVersion: z.string().datetime().optional(),
  activitySummary: z
    .object({
      problemsReviewed: z.number().int().min(0).optional(),
      problemsReported: z.number().int().min(0).optional(),
      evidenceAdded: z.number().int().min(0).optional(),
      solutionsProposed: z.number().int().min(0).optional(),
      debatesContributed: z.number().int().min(0).optional(),
      messagesReceived: z.number().int().min(0).optional(),
      messagesResponded: z.number().int().min(0).optional(),
    })
    .optional(),
  timestamp: z.string().datetime(),
  clientVersion: z.string().optional(),
});
