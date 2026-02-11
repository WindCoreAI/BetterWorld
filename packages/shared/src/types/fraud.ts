/**
 * Fraud Detection TypeScript Types (Sprint 9: Reputation & Impact)
 */
import type { z } from "zod";

import type {
  fraudScoreSchema,
  fraudStatusSchema,
  fraudEventSchema,
  fraudAdminActionSchema,
  fraudQueueQuerySchema,
} from "../schemas/fraud.js";

export type FraudScore = z.infer<typeof fraudScoreSchema>;
export type FraudStatus = z.infer<typeof fraudStatusSchema>;
export type FraudEvent = z.infer<typeof fraudEventSchema>;
export type FraudAdminAction = z.infer<typeof fraudAdminActionSchema>;
export type FraudQueueEntry = z.infer<typeof fraudQueueQuerySchema>;
