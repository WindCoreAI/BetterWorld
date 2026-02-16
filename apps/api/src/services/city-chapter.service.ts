/**
 * City Chapter Service (Sprint 17: Community Identity & Visible Growth)
 *
 * Aggregates chapter metrics, heatmap data, and milestones per city.
 * Redis 5-min cache per city slug.
 */
import {
  problems,
  observations,
  missions,
  humanProfiles,
  groupMilestones,
} from "@betterworld/db";
import { SUPPORTED_CITY_MAP } from "@betterworld/shared";
import { eq, sql, and, count, desc, isNull, isNotNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "../lib/container.js";

const logger = pino({ name: "city-chapter-service" });

const CITY_CACHE_TTL = 300; // 5 minutes

interface ChapterMetrics {
  totalProblems: number;
  totalObservations: number;
  activeLocalValidators: number;
  missionsCompleted: number;
  activeParticipants: number;
}

interface CityChapterData {
  slug: string;
  displayName: string;
  tagline: string;
  metrics: ChapterMetrics;
  heatmap: Array<{ lat: number; lng: number; intensity: number }>;
  milestones: Array<{
    id: string;
    milestoneType: string;
    targetValue: number;
    currentValue: number;
    reachedAt: string | null;
  }>;
  recentMilestones: Array<{
    id: string;
    milestoneType: string;
    targetValue: number;
    currentValue: number;
    reachedAt: string | null;
    bannerExpiresAt: string | null;
  }>;
}

export class CityChapterService {
  constructor(private readonly db: PostgresJsDatabase) {}

  async getChapter(citySlug: string): Promise<CityChapterData | null> {
    const cityConfig = SUPPORTED_CITY_MAP.get(citySlug);
    if (!cityConfig) return null;

    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(`city-chapter:${citySlug}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    // Total problems for this city (by location name matching)
    const [totalProblems] = await this.db
      .select({ count: count() })
      .from(problems)
      .where(sql`lower(${problems.locationName}) LIKE ${"%" + citySlug + "%"}`);

    // Total observations (counted via city-level proximity, simplified to total for now)
    const [totalObservations] = await this.db
      .select({ count: count() })
      .from(observations);

    // Missions completed in city
    const [missionsCompleted] = await this.db
      .select({ count: count() })
      .from(missions)
      .where(
        and(
          eq(missions.status, "verified"),
          sql`lower(${missions.requiredLocationName}) LIKE ${"%" + citySlug + "%"}`,
        ),
      );

    // Active participants (humans with city matching)
    const [activeParticipants] = await this.db
      .select({ count: count() })
      .from(humanProfiles)
      .where(sql`lower(${humanProfiles.city}) LIKE ${"%" + citySlug + "%"}`);

    const metrics: ChapterMetrics = {
      totalProblems: totalProblems?.count ?? 0,
      totalObservations: totalObservations?.count ?? 0,
      activeLocalValidators: 0, // Computed separately from validator pool
      missionsCompleted: missionsCompleted?.count ?? 0,
      activeParticipants: activeParticipants?.count ?? 0,
    };

    // Milestones - unreached
    const milestones = await this.db
      .select({
        id: groupMilestones.id,
        milestoneType: groupMilestones.milestoneType,
        targetValue: groupMilestones.targetValue,
        currentValue: groupMilestones.currentValue,
        reachedAt: groupMilestones.reachedAt,
      })
      .from(groupMilestones)
      .where(
        and(
          eq(groupMilestones.groupType, "city"),
          eq(groupMilestones.groupValue, citySlug),
          isNull(groupMilestones.reachedAt),
        ),
      )
      .orderBy(groupMilestones.targetValue)
      .limit(10);

    // Milestones - recently reached
    const recentMilestones = await this.db
      .select({
        id: groupMilestones.id,
        milestoneType: groupMilestones.milestoneType,
        targetValue: groupMilestones.targetValue,
        currentValue: groupMilestones.currentValue,
        reachedAt: groupMilestones.reachedAt,
        bannerExpiresAt: groupMilestones.bannerExpiresAt,
      })
      .from(groupMilestones)
      .where(
        and(
          eq(groupMilestones.groupType, "city"),
          eq(groupMilestones.groupValue, citySlug),
          isNotNull(groupMilestones.reachedAt),
        ),
      )
      .orderBy(desc(groupMilestones.reachedAt))
      .limit(5);

    const result: CityChapterData = {
      slug: citySlug,
      displayName: cityConfig.displayName,
      tagline: cityConfig.tagline,
      metrics,
      heatmap: [], // Heatmap data populated by existing city metrics worker
      milestones: milestones.map((m) => ({
        id: m.id,
        milestoneType: m.milestoneType,
        targetValue: m.targetValue,
        currentValue: m.currentValue,
        reachedAt: m.reachedAt?.toISOString() ?? null,
      })),
      recentMilestones: recentMilestones.map((m) => ({
        id: m.id,
        milestoneType: m.milestoneType,
        targetValue: m.targetValue,
        currentValue: m.currentValue,
        reachedAt: m.reachedAt?.toISOString() ?? null,
        bannerExpiresAt: m.bannerExpiresAt?.toISOString() ?? null,
      })),
    };

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(`city-chapter:${citySlug}`, JSON.stringify(result), "EX", CITY_CACHE_TTL);
      }
    } catch {
      // Non-fatal
    }

    logger.info({ citySlug }, "City chapter fetched");
    return result;
  }
}
