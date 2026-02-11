/**
 * Metrics Aggregator (Sprint 9: Reputation & Impact)
 *
 * Aggregates platform metrics and stores in Redis for dashboards.
 */
import {
  humans,
  missions,
  missionClaims,
  problems,
  solutions,
  tokenTransactions,
} from "@betterworld/db";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "metrics-aggregator" });

const CACHE_TTL = 3600; // 1 hour

// ────────────────── Aggregate Functions ──────────────────

export interface DashboardMetrics {
  totals: {
    missionsCompleted: number;
    impactTokensDistributed: number;
    activeHumans: number;
    problemsReported: number;
    solutionsProposed: number;
  };
  domainBreakdown: Array<{
    domain: string;
    missionCount: number;
    tokenTotal: number;
    humanCount: number;
  }>;
  recentActivity: {
    missionsThisWeek: number;
    missionsThisMonth: number;
    newHumansThisMonth: number;
  };
  lastUpdatedAt: string;
}

export async function aggregateDashboardMetrics(
  db: PostgresJsDatabase,
): Promise<DashboardMetrics> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Totals
  const [missionsResult] = await db
    .select({ count: count() })
    .from(missionClaims)
    .where(eq(missionClaims.status, "verified"));

  const [tokensResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
    .from(tokenTransactions)
    .where(sql`${tokenTransactions.transactionType} LIKE 'earn_%'`);

  const [humansResult] = await db
    .select({ count: count() })
    .from(humans)
    .where(eq(humans.isActive, true));

  const [problemsResult] = await db
    .select({ count: count() })
    .from(problems);

  const [solutionsResult] = await db
    .select({ count: count() })
    .from(solutions);

  // Domain breakdown
  const domainRows = await db
    .select({
      domain: missions.domain,
      missionCount: count(),
    })
    .from(missions)
    .groupBy(missions.domain)
    .orderBy(desc(count()));

  const domainBreakdown = domainRows.map((r) => ({
    domain: r.domain,
    missionCount: Number(r.missionCount),
    tokenTotal: 0, // Simplified — would need a join for token totals
    humanCount: 0,
  }));

  // Recent activity
  const [missionsWeek] = await db
    .select({ count: count() })
    .from(missionClaims)
    .where(
      and(
        eq(missionClaims.status, "verified"),
        gte(missionClaims.updatedAt, oneWeekAgo),
      ),
    );

  const [missionsMonth] = await db
    .select({ count: count() })
    .from(missionClaims)
    .where(
      and(
        eq(missionClaims.status, "verified"),
        gte(missionClaims.updatedAt, oneMonthAgo),
      ),
    );

  const [newHumansMonth] = await db
    .select({ count: count() })
    .from(humans)
    .where(gte(humans.createdAt, oneMonthAgo));

  return {
    totals: {
      missionsCompleted: missionsResult?.count ?? 0,
      impactTokensDistributed: Number(tokensResult?.total ?? 0),
      activeHumans: humansResult?.count ?? 0,
      problemsReported: problemsResult?.count ?? 0,
      solutionsProposed: solutionsResult?.count ?? 0,
    },
    domainBreakdown,
    recentActivity: {
      missionsThisWeek: missionsWeek?.count ?? 0,
      missionsThisMonth: missionsMonth?.count ?? 0,
      newHumansThisMonth: newHumansMonth?.count ?? 0,
    },
    lastUpdatedAt: now.toISOString(),
  };
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
  count: number;
}

/**
 * Aggregate heatmap data by snapping mission coordinates to grid cells.
 */
export async function aggregateHeatmapData(
  db: PostgresJsDatabase,
): Promise<HeatmapPoint[]> {
  const rows = await db
    .select({
      lat: sql<number>`ROUND(CAST(${missions.requiredLatitude} AS numeric), 1)`,
      lng: sql<number>`ROUND(CAST(${missions.requiredLongitude} AS numeric), 1)`,
      count: count(),
    })
    .from(missions)
    .where(
      and(
        sql`${missions.requiredLatitude} IS NOT NULL`,
        sql`${missions.requiredLongitude} IS NOT NULL`,
      ),
    )
    .groupBy(
      sql`ROUND(CAST(${missions.requiredLatitude} AS numeric), 1)`,
      sql`ROUND(CAST(${missions.requiredLongitude} AS numeric), 1)`,
    );

  if (rows.length === 0) return [];

  const maxCount = Math.max(...rows.map((r) => Number(r.count)));

  return rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lng),
    intensity: maxCount > 0 ? Number(r.count) / maxCount : 0,
    count: Number(r.count),
  }));
}

// ────────────────── Redis Storage ──────────────────

export async function storeAllInRedis(
  redis: Redis,
  dashboard: DashboardMetrics,
  heatmap: HeatmapPoint[],
): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.setex(
    "metrics:aggregate:dashboard",
    CACHE_TTL,
    JSON.stringify(dashboard),
  );
  pipeline.setex(
    "metrics:aggregate:heatmap:alltime",
    CACHE_TTL,
    JSON.stringify(heatmap),
  );
  pipeline.set("metrics:aggregate:last_updated", new Date().toISOString());
  await pipeline.exec();

  logger.info("Metrics stored in Redis");
}

/**
 * Get cached dashboard metrics from Redis.
 */
export async function getCachedDashboard(
  redis: Redis,
): Promise<DashboardMetrics | null> {
  const data = await redis.get("metrics:aggregate:dashboard");
  if (!data) return null;
  try {
    return JSON.parse(data) as DashboardMetrics;
  } catch {
    return null;
  }
}

/**
 * Get cached heatmap from Redis.
 */
export async function getCachedHeatmap(
  redis: Redis,
  _period = "alltime",
): Promise<HeatmapPoint[] | null> {
  const data = await redis.get("metrics:aggregate:heatmap:alltime");
  if (!data) return null;
  try {
    return JSON.parse(data) as HeatmapPoint[];
  } catch {
    return null;
  }
}
