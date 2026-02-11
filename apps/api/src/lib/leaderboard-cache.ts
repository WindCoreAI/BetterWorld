/**
 * Leaderboard Cache Manager (Sprint 9: Reputation & Impact)
 *
 * Builds leaderboard queries, manages Redis sorted set cache,
 * and provides cursor-based pagination.
 */
import {
  reputationScores,
  humans,
  missionClaims,
  evidence,
} from "@betterworld/db";
import { count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

const DEFAULT_TTL = 3600; // 1 hour
const MAX_ENTRIES = 100;

export interface LeaderboardEntryRow {
  rank: number;
  humanId: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  tier?: string;
}

// ────────────────── Cache Key Management ──────────────────

export function buildCacheKey(
  type: string,
  period: string,
  domain?: string,
  location?: string,
): string {
  return `leaderboard:${type}:${period}:${domain ?? "global"}:${location ?? "global"}`;
}

export async function getFromCache(
  redis: Redis,
  key: string,
): Promise<LeaderboardEntryRow[] | null> {
  const data = await redis.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as LeaderboardEntryRow[];
  } catch {
    return null;
  }
}

export async function setCache(
  redis: Redis,
  key: string,
  entries: LeaderboardEntryRow[],
  ttl = DEFAULT_TTL,
): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(entries));
}

export async function invalidateByType(
  redis: Redis,
  type: string,
): Promise<void> {
  const keys = await redis.keys(`leaderboard:${type}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// ────────────────── Cursor Pagination ──────────────────

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64");
}

export function decodeCursor(cursor: string): number {
  try {
    return parseInt(Buffer.from(cursor, "base64").toString(), 10);
  } catch {
    return 0;
  }
}

// ────────────────── Query Builders ──────────────────

/**
 * Build reputation leaderboard from DB.
 */
export async function queryReputationLeaderboard(
  db: PostgresJsDatabase,
  limit = MAX_ENTRIES,
): Promise<LeaderboardEntryRow[]> {
  const rows = await db
    .select({
      humanId: reputationScores.humanId,
      displayName: humans.displayName,
      avatarUrl: humans.avatarUrl,
      score: reputationScores.totalScore,
      tier: reputationScores.currentTier,
    })
    .from(reputationScores)
    .innerJoin(humans, eq(reputationScores.humanId, humans.id))
    .where(eq(humans.isActive, true))
    .orderBy(desc(reputationScores.totalScore))
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i,
    humanId: r.humanId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl ?? null,
    score: Number(r.score),
    tier: r.tier,
  }));
}

/**
 * Build tokens leaderboard from DB.
 */
export async function queryTokensLeaderboard(
  db: PostgresJsDatabase,
  limit = MAX_ENTRIES,
): Promise<LeaderboardEntryRow[]> {
  const rows = await db
    .select({
      humanId: humans.id,
      displayName: humans.displayName,
      avatarUrl: humans.avatarUrl,
      score: humans.tokenBalance,
    })
    .from(humans)
    .where(eq(humans.isActive, true))
    .orderBy(desc(humans.tokenBalance))
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i,
    humanId: r.humanId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl ?? null,
    score: Number(r.score),
  }));
}

/**
 * Build missions leaderboard from DB.
 */
export async function queryMissionsLeaderboard(
  db: PostgresJsDatabase,
  limit = MAX_ENTRIES,
): Promise<LeaderboardEntryRow[]> {
  const rows = await db
    .select({
      humanId: missionClaims.humanId,
      displayName: humans.displayName,
      avatarUrl: humans.avatarUrl,
      score: count(),
    })
    .from(missionClaims)
    .innerJoin(humans, eq(missionClaims.humanId, humans.id))
    .where(eq(missionClaims.status, "verified"))
    .groupBy(missionClaims.humanId, humans.displayName, humans.avatarUrl)
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i,
    humanId: r.humanId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl ?? null,
    score: Number(r.score),
  }));
}

/**
 * Build impact leaderboard from DB (based on verified evidence count).
 */
export async function queryImpactLeaderboard(
  db: PostgresJsDatabase,
  limit = MAX_ENTRIES,
): Promise<LeaderboardEntryRow[]> {
  const rows = await db
    .select({
      humanId: evidence.submittedByHumanId,
      displayName: humans.displayName,
      avatarUrl: humans.avatarUrl,
      score: count(),
    })
    .from(evidence)
    .innerJoin(humans, eq(evidence.submittedByHumanId, humans.id))
    .where(eq(evidence.verificationStage, "verified"))
    .groupBy(
      evidence.submittedByHumanId,
      humans.displayName,
      humans.avatarUrl,
    )
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i,
    humanId: r.humanId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl ?? null,
    score: Number(r.score),
  }));
}

/**
 * Get a specific leaderboard (cache first, DB fallback).
 */
export async function getLeaderboard(
  db: PostgresJsDatabase,
  redis: Redis | null,
  type: string,
  period = "alltime",
  domain?: string,
  location?: string,
  limit = MAX_ENTRIES,
): Promise<{
  entries: LeaderboardEntryRow[];
  cacheAge: number | null;
  total: number;
}> {
  const cacheKey = buildCacheKey(type, period, domain, location);

  // Try cache first
  if (redis) {
    const cached = await getFromCache(redis, cacheKey);
    if (cached) {
      const ttl = await redis.ttl(cacheKey);
      return {
        entries: cached.slice(0, limit),
        cacheAge: DEFAULT_TTL - ttl,
        total: cached.length,
      };
    }
  }

  // DB fallback
  let entries: LeaderboardEntryRow[];
  switch (type) {
    case "reputation":
      entries = await queryReputationLeaderboard(db, MAX_ENTRIES);
      break;
    case "tokens":
      entries = await queryTokensLeaderboard(db, MAX_ENTRIES);
      break;
    case "missions":
      entries = await queryMissionsLeaderboard(db, MAX_ENTRIES);
      break;
    case "impact":
      entries = await queryImpactLeaderboard(db, MAX_ENTRIES);
      break;
    default:
      entries = [];
  }

  // Cache result
  if (redis && entries.length > 0) {
    await setCache(redis, cacheKey, entries);
  }

  return {
    entries: entries.slice(0, limit),
    cacheAge: null,
    total: entries.length,
  };
}

/**
 * Get user's rank in a leaderboard.
 */
export async function getUserRank(
  db: PostgresJsDatabase,
  redis: Redis | null,
  type: string,
  humanId: string,
  period = "alltime",
): Promise<{
  rank: number;
  score: number;
  total: number;
  percentile: number;
  context: LeaderboardEntryRow[];
}> {
  const { entries, total } = await getLeaderboard(
    db,
    redis,
    type,
    period,
  );
  const userIndex = entries.findIndex((e) => e.humanId === humanId);

  if (userIndex === -1) {
    return { rank: total, score: 0, total, percentile: 0, context: [] };
  }

  const percentile =
    total > 1 ? ((total - 1 - userIndex) / (total - 1)) * 100 : 100;

  // Context: 5 entries above and below
  const start = Math.max(0, userIndex - 5);
  const end = Math.min(entries.length, userIndex + 6);
  const context = entries.slice(start, end);

  return {
    rank: userIndex,
    score: entries[userIndex]!.score,
    total,
    percentile: Math.round(percentile * 100) / 100,
    context,
  };
}
