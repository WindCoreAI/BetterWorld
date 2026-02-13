/**
 * Cross-City Comparison Service (Sprint 13 — Phase 3 Integration)
 *
 * Provides comparative metrics across cities, normalized by population.
 * Aggregates problem counts, observation counts, and validator density.
 */
import { problems, observations, validatorPool } from "@betterworld/db";
import {
  CITY_POPULATIONS,
  OPEN311_CITY_CONFIGS,
} from "@betterworld/shared";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface CityMetric {
  id: string;
  name: string;
  problems: number;
  problemsPerCapita: number;
  observations: number;
  validatorCount: number;
  validatorDensity: number;
}

export interface ComparativeMetrics {
  cities: CityMetric[];
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Get comparative metrics across all configured cities.
 *
 * Queries per-city:
 * - Problem counts (from problems.municipal_source_type)
 * - Observation counts (joined through problems)
 * - Validator counts (from validatorPool.home_region_name ILIKE city)
 *
 * Normalizes by population from CITY_POPULATIONS constant.
 */
export async function getComparativeMetrics(
  db: PostgresJsDatabase,
): Promise<ComparativeMetrics> {
  const cityIds = Object.keys(OPEN311_CITY_CONFIGS);

  // 1. Per-city problem counts
  const problemCounts = await db.execute(sql`
    SELECT municipal_source_type AS city, COUNT(*) AS count
    FROM problems
    WHERE municipal_source_type IS NOT NULL
      AND municipal_source_type IN (${sql.join(cityIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY municipal_source_type
  `);

  const problemMap = new Map<string, number>();
  for (const row of problemCounts as Array<Record<string, string>>) {
    problemMap.set(row.city!, Number(row.count ?? 0));
  }

  // 2. Per-city observation counts (observations linked to problems by city)
  const observationCounts = await db.execute(sql`
    SELECT p.municipal_source_type AS city, COUNT(o.id) AS count
    FROM observations o
    JOIN problems p ON o.problem_id = p.id
    WHERE p.municipal_source_type IS NOT NULL
      AND p.municipal_source_type IN (${sql.join(cityIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY p.municipal_source_type
  `);

  const observationMap = new Map<string, number>();
  for (const row of observationCounts as Array<Record<string, string>>) {
    observationMap.set(row.city!, Number(row.count ?? 0));
  }

  // 3. Per-city validator counts (home_region_name contains city name)
  const validatorCounts = await db.execute(sql`
    SELECT home_region_name AS region, COUNT(*) AS count
    FROM validator_pool
    WHERE is_active = true
      AND home_region_name IS NOT NULL
    GROUP BY home_region_name
  `);

  const validatorMap = new Map<string, number>();
  for (const row of validatorCounts as Array<Record<string, string>>) {
    const regionName = (row.region ?? "").toLowerCase();
    for (const cityId of cityIds) {
      if (regionName.includes(cityId)) {
        validatorMap.set(
          cityId,
          (validatorMap.get(cityId) ?? 0) + Number(row.count ?? 0),
        );
      }
    }
  }

  // 4. Build city metrics with per-capita normalization
  const cities: CityMetric[] = cityIds.map((cityId) => {
    const config = OPEN311_CITY_CONFIGS[cityId]!;
    const population = CITY_POPULATIONS[cityId] ?? 1;
    const problemCount = problemMap.get(cityId) ?? 0;
    const observationCount = observationMap.get(cityId) ?? 0;
    const validatorCount = validatorMap.get(cityId) ?? 0;

    // Per 100,000 residents
    const perCapitaFactor = 100_000 / population;

    return {
      id: cityId,
      name: config.displayName,
      problems: problemCount,
      problemsPerCapita: Number((problemCount * perCapitaFactor).toFixed(2)),
      observations: observationCount,
      validatorCount,
      validatorDensity: Number((validatorCount * perCapitaFactor).toFixed(4)),
    };
  });

  logger.info(
    { cityCount: cities.length },
    "Cross-city comparative metrics computed",
  );

  return { cities };
}

/**
 * Get a single metric detail for all cities.
 *
 * @param db - Database connection
 * @param metric - One of: "problems_per_capita", "observations", "validator_density"
 */
export async function getSingleMetric(
  db: PostgresJsDatabase,
  metric: string,
): Promise<{ metric: string; cities: Array<{ id: string; name: string; value: number }> }> {
  const { cities } = await getComparativeMetrics(db);

  const valueExtractor: Record<string, (c: CityMetric) => number> = {
    problems_per_capita: (c) => c.problemsPerCapita,
    observations: (c) => c.observations,
    validator_density: (c) => c.validatorDensity,
    problems: (c) => c.problems,
    validator_count: (c) => c.validatorCount,
  };

  const extractor = valueExtractor[metric];
  if (!extractor) {
    return { metric, cities: [] };
  }

  return {
    metric,
    cities: cities.map((c) => ({
      id: c.id,
      name: c.name,
      value: extractor(c),
    })),
  };
}
