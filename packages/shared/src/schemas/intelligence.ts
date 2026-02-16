/**
 * Intelligence Report Schemas (Sprint 17: Community Identity & Visible Growth)
 */
import { z } from "zod";

/** Report month format: YYYY-MM */
export const reportMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Systemic issue in a report */
export const systemicIssueSchema = z.object({
  clusterId: z.string().uuid(),
  title: z.string(),
  memberCount: z.number(),
  cities: z.array(z.string()),
});

/** Cross-city adoption record */
export const crossCityAdoptionSchema = z.object({
  solutionId: z.string().uuid(),
  title: z.string(),
  adoptedCities: z.array(z.string()),
});

/** Domain trend data */
export const domainTrendSchema = z.object({
  domain: z.string(),
  problemsDelta: z.number(),
  missionsDelta: z.number(),
  membersDelta: z.number(),
});

/** Top pattern entry */
export const topPatternSchema = z.object({
  pattern: z.string(),
  urgency: z.string(),
  occurrences: z.number(),
});

/** Collective progress metrics */
export const collectiveProgressSchema = z.object({
  totalMissionsCompleted: z.number(),
  totalProblemsResolved: z.number(),
  totalNewMembers: z.number(),
  activeParticipants: z.number(),
});

/** Full intelligence report data structure (JSONB) */
export const reportDataSchema = z.object({
  systemicIssues: z.array(systemicIssueSchema),
  crossCityAdoptions: z.array(crossCityAdoptionSchema),
  domainTrends: z.array(domainTrendSchema),
  topPatterns: z.array(topPatternSchema),
  collectiveProgress: collectiveProgressSchema,
});

export type ReportData = z.infer<typeof reportDataSchema>;
