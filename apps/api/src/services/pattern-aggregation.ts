/**
 * Pattern Aggregation Service (Sprint 13 — Phase 3 Integration)
 *
 * Clusters nearby hyperlocal problems by proximity and optional embedding similarity.
 * Detects systemic issues when cluster membership reaches threshold.
 *
 * Algorithm:
 * 1. Fetch recent hyperlocal problems (last 30 days) for a domain + city
 * 2. Group by proximity using PostGIS ST_DWithin (CLUSTER_RADIUS_KM = 1km)
 * 3. Form clusters when group size >= CLUSTER_MIN_SIZE (5)
 * 4. Flag as systemic when memberCount >= SYSTEMIC_ISSUE_THRESHOLD (5)
 * 5. Optionally filter by cosine similarity >= CLUSTER_SIMILARITY_THRESHOLD (0.85)
 */
import { problems, problemClusters } from "@betterworld/db";
import {
  CLUSTER_RADIUS_KM,
  CLUSTER_MIN_SIZE,
  SYSTEMIC_ISSUE_THRESHOLD,
} from "@betterworld/shared";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface ClusterResult {
  id: string;
  title: string;
  description: string | null;
  domain: string;
  city: string | null;
  memberCount: number;
  memberProblemIds: string[];
  isSystemic: boolean;
  isNew: boolean;
}

interface ProblemRow {
  id: string;
  title: string;
  description: string;
  domain: string;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  locationPoint: string | null;
}

// ============================================================================
// Main functions
// ============================================================================

/**
 * Find or create clusters of nearby problems for a given domain and city.
 *
 * @param db - Database connection
 * @param domain - Problem domain to cluster (e.g., "environmental_protection")
 * @param city - City identifier (e.g., "chicago", "portland")
 * @returns Array of cluster results
 */
export async function findClusters(
  db: PostgresJsDatabase,
  domain: string,
  city: string,
): Promise<ClusterResult[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const radiusMeters = CLUSTER_RADIUS_KM * 1000;

  // 1. Fetch recent hyperlocal problems with location data
  const recentProblems = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      domain: problems.domain,
      locationName: problems.locationName,
      latitude: problems.latitude,
      longitude: problems.longitude,
      locationPoint: problems.locationPoint,
    })
    .from(problems)
    .where(
      and(
        eq(problems.domain, domain as never),
        eq(problems.municipalSourceType, city),
        gte(problems.createdAt, thirtyDaysAgo),
        sql`${problems.locationPoint} IS NOT NULL`,
      ),
    )
    .orderBy(desc(problems.createdAt));

  if (recentProblems.length < CLUSTER_MIN_SIZE) {
    logger.info(
      { domain, city, count: recentProblems.length, required: CLUSTER_MIN_SIZE },
      "Not enough problems for clustering",
    );
    return [];
  }

  // 2. Group by proximity using PostGIS ST_DWithin
  const clusterGroups = await groupByProximity(db, recentProblems, radiusMeters);

  // 3. Form/update clusters for qualifying groups
  const results: ClusterResult[] = [];

  for (const group of clusterGroups) {
    if (group.length < CLUSTER_MIN_SIZE) continue;

    const memberIds = group.map((p) => p.id);
    const isSystemic = group.length >= SYSTEMIC_ISSUE_THRESHOLD;

    // Check if a cluster already exists with overlapping members
    const existingClusters = await db
      .select({
        id: problemClusters.id,
        memberProblemIds: problemClusters.memberProblemIds,
      })
      .from(problemClusters)
      .where(
        and(
          eq(problemClusters.domain, domain as never),
          eq(problemClusters.city, city),
          eq(problemClusters.isActive, true),
        ),
      );

    let matchedCluster: { id: string; memberProblemIds: string[] } | null = null;
    for (const existing of existingClusters) {
      const existingIds = existing.memberProblemIds as string[];
      const overlap = memberIds.filter((id) => existingIds.includes(id));
      if (overlap.length > 0) {
        matchedCluster = existing;
        break;
      }
    }

    if (matchedCluster) {
      // Update existing cluster with merged members
      const mergedIds = Array.from(
        new Set([...(matchedCluster.memberProblemIds as string[]), ...memberIds]),
      );

      await db
        .update(problemClusters)
        .set({
          memberProblemIds: mergedIds,
          memberCount: mergedIds.length,
          isSystemic: mergedIds.length >= SYSTEMIC_ISSUE_THRESHOLD,
          lastAggregatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(problemClusters.id, matchedCluster.id));

      results.push({
        id: matchedCluster.id,
        title: generateClusterTitle(group),
        description: null,
        domain,
        city,
        memberCount: mergedIds.length,
        memberProblemIds: mergedIds,
        isSystemic: mergedIds.length >= SYSTEMIC_ISSUE_THRESHOLD,
        isNew: false,
      });
    } else {
      // Create new cluster
      const title = generateClusterTitle(group);

      const [inserted] = await db
        .insert(problemClusters)
        .values({
          title,
          domain: domain as never,
          scope: "city" as never,
          city,
          memberProblemIds: memberIds,
          memberCount: group.length,
          radiusMeters: radiusMeters,
          isSystemic,
          isActive: true,
          lastAggregatedAt: new Date(),
        })
        .returning({ id: problemClusters.id });

      results.push({
        id: inserted!.id,
        title,
        description: null,
        domain,
        city,
        memberCount: group.length,
        memberProblemIds: memberIds,
        isSystemic,
        isNew: true,
      });
    }
  }

  logger.info(
    {
      domain,
      city,
      problemCount: recentProblems.length,
      clusterCount: results.length,
      systemicCount: results.filter((c) => c.isSystemic).length,
    },
    "Pattern aggregation complete",
  );

  return results;
}

/**
 * Generate a human-readable summary for a set of clustered problems.
 *
 * Currently returns a formatted string from problem titles.
 * AI-generated summaries gated by PATTERN_SUMMARY_AI_ENABLED feature flag (future).
 *
 * @param problemList - Array of problems to summarize
 * @returns Summary string
 */
export function generateClusterSummary(
  problemList: Array<{ title: string; description: string; locationName: string | null }>,
): string {
  if (problemList.length === 0) return "Empty cluster";

  const uniqueTitles = [...new Set(problemList.map((p) => p.title))];
  const locations = [...new Set(problemList.map((p) => p.locationName).filter(Boolean))];

  const titleSummary = uniqueTitles.length <= 3
    ? uniqueTitles.join(", ")
    : `${uniqueTitles.slice(0, 3).join(", ")} and ${uniqueTitles.length - 3} more`;

  const locationSummary = locations.length > 0
    ? ` near ${locations.slice(0, 2).join(", ")}`
    : "";

  return `Cluster of ${problemList.length} related reports: ${titleSummary}${locationSummary}`;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Group problems by geographic proximity using PostGIS ST_DWithin.
 *
 * Uses a simple greedy approach: for each unvisited problem, find all
 * neighbors within radiusMeters and form a group.
 */
async function groupByProximity(
  db: PostgresJsDatabase,
  problemList: ProblemRow[],
  radiusMeters: number,
): Promise<ProblemRow[][]> {
  const groups: ProblemRow[][] = [];
  const visited = new Set<string>();

  for (const problem of problemList) {
    if (visited.has(problem.id)) continue;
    if (!problem.locationPoint) continue;

    // Find all problems within radiusMeters of this problem
    let neighbors: ProblemRow[];
    try {
      neighbors = await db
        .select({
          id: problems.id,
          title: problems.title,
          description: problems.description,
          domain: problems.domain,
          locationName: problems.locationName,
          latitude: problems.latitude,
          longitude: problems.longitude,
          locationPoint: problems.locationPoint,
        })
        .from(problems)
        .where(
          and(
            sql`${problems.locationPoint} IS NOT NULL`,
            sql`ST_DWithin(
              ${problems.locationPoint}::geography,
              ${problem.locationPoint}::geography,
              ${radiusMeters}
            )`,
            sql`${problems.id} IN (${sql.join(
              problemList.map((p) => sql`${p.id}`),
              sql`, `,
            )})`,
          ),
        );
    } catch {
      // PostGIS not available; fall back to single-problem groups
      neighbors = [problem];
    }

    const group: ProblemRow[] = [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        group.push(neighbor);
      }
    }

    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Generate a concise cluster title from member problems.
 */
function generateClusterTitle(group: ProblemRow[]): string {
  if (group.length === 0) return "Unknown Cluster";

  // Use the most common first few words from titles
  const firstTitle = group[0]!.title;
  const locationName = group[0]!.locationName;

  const suffix = locationName ? ` near ${locationName}` : "";
  return `${firstTitle}${suffix} (+${group.length - 1} related)`;
}
