/**
 * Impact Dashboard TypeScript Types (Sprint 9: Reputation & Impact)
 */
import type { z } from "zod";

import type {
  dashboardMetricsSchema,
  heatmapPointSchema,
  portfolioSchema,
  portfolioVisibilitySchema,
} from "../schemas/impact.js";

export type ImpactDashboard = z.infer<typeof dashboardMetricsSchema>;
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type PortfolioVisibility = z.infer<typeof portfolioVisibilitySchema>;
