/**
 * Impact Dashboard Zod Schemas (Sprint 9: Reputation & Impact)
 */
import { z } from "zod";

export const dashboardMetricsSchema = z.object({
  totals: z.object({
    missionsCompleted: z.number().int().min(0),
    impactTokensDistributed: z.number().min(0),
    activeHumans: z.number().int().min(0),
    problemsReported: z.number().int().min(0),
    solutionsProposed: z.number().int().min(0),
  }),
  domainBreakdown: z.array(
    z.object({
      domain: z.string(),
      missionCount: z.number().int().min(0),
      tokenTotal: z.number().min(0),
      humanCount: z.number().int().min(0),
    }),
  ),
  recentActivity: z.object({
    missionsThisWeek: z.number().int().min(0),
    missionsThisMonth: z.number().int().min(0),
    newHumansThisMonth: z.number().int().min(0),
  }),
  lastUpdatedAt: z.string().datetime(),
});

export const heatmapPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  intensity: z.number().min(0).max(1),
  count: z.number().int().min(0),
});

export const heatmapQuerySchema = z.object({
  domain: z.string().optional(),
  period: z.enum(["alltime", "month", "week"]).default("alltime"),
  sw_lat: z.coerce.number().optional(),
  sw_lng: z.coerce.number().optional(),
  ne_lat: z.coerce.number().optional(),
  ne_lng: z.coerce.number().optional(),
});

export const portfolioVisibilitySchema = z.enum(["public", "private"]);

export const portfolioSchema = z.object({
  humanId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  reputation: z.object({
    totalScore: z.number(),
    tier: z.string(),
    tierMultiplier: z.number(),
  }),
  stats: z.object({
    missionsCompleted: z.number().int().min(0),
    totalTokensEarned: z.number().min(0),
    domainsContributed: z.number().int().min(0),
    currentStreak: z.number().int().min(0),
    longestStreak: z.number().int().min(0),
    endorsementsReceived: z.number().int().min(0),
  }),
  missions: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      domain: z.string(),
      thumbnailUrl: z.string().nullable(),
      completedAt: z.string().datetime(),
    }),
  ),
  visibility: portfolioVisibilitySchema,
  joinedAt: z.string().datetime(),
});
