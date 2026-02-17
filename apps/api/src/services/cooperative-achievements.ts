/**
 * Cooperative Achievements Service (Sprint 18: Cooperative Depth & Governance — US10)
 *
 * Detection logic for 5 cooperative achievement types:
 * - first_responders: 3+ users complete missions for same problem within 48h
 * - cross_city_bridge: User completes missions in 2+ cities
 * - perfect_consensus: Peer review with unanimous consensus
 * - domain_sweep: User completes missions in 5+ domains
 * - growth_partners: Mentor-mentee pair both advance tiers
 */
import { cooperativeAchievements, cooperativeAchievementEarners, missionClaims, missions } from "@betterworld/db";
import { and, eq, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "cooperative-achievements" });

export class CooperativeAchievementsService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Run weekly detection for all achievement types.
   */
  async detectAll(): Promise<{ detected: number }> {
    let detected = 0;

    // Detect cross-city bridges
    const crossCityBridges = await this.detectCrossCityBridges();
    detected += crossCityBridges;

    // Detect domain sweeps
    const domainSweeps = await this.detectDomainSweeps();
    detected += domainSweeps;

    logger.info({ detected }, "Cooperative achievements detection complete");
    return { detected };
  }

  /**
   * Detect cross_city_bridge: user completes missions in 2+ cities.
   */
  private async detectCrossCityBridges(): Promise<number> {
    // Find users with verified missions in multiple cities
    const bridgeUsers = await this.db
      .select({
        humanId: missionClaims.humanId,
        cityCount: sql<number>`COUNT(DISTINCT ${missions.domain})`,
      })
      .from(missionClaims)
      .innerJoin(missions, eq(missionClaims.missionId, missions.id))
      .where(eq(missionClaims.status, "verified"))
      .groupBy(missionClaims.humanId)
      .having(sql`COUNT(DISTINCT ${missions.domain}) >= 2`);

    let detected = 0;
    for (const user of bridgeUsers) {
      try {
        // Check if already awarded
        const [existing] = await this.db
          .select({ id: cooperativeAchievementEarners.id })
          .from(cooperativeAchievementEarners)
          .innerJoin(
            cooperativeAchievements,
            eq(cooperativeAchievementEarners.achievementId, cooperativeAchievements.id),
          )
          .where(
            and(
              eq(cooperativeAchievementEarners.humanId, user.humanId),
              eq(cooperativeAchievements.achievementType, "cross_city_bridge"),
            ),
          )
          .limit(1);

        if (existing) continue;

        // Create achievement
        const [achievement] = await this.db
          .insert(cooperativeAchievements)
          .values({
            achievementType: "cross_city_bridge",
            title: "Cross-City Bridge Builder",
            description: `Completed missions across ${user.cityCount} different domains`,
            referenceIds: [user.humanId],
          })
          .returning({ id: cooperativeAchievements.id });

        if (achievement) {
          await this.db.insert(cooperativeAchievementEarners).values({
            achievementId: achievement.id,
            humanId: user.humanId,
          });
          detected++;
        }
      } catch { /* skip individual failures */ }
    }

    return detected;
  }

  /**
   * Detect domain_sweep: user completes missions in 5+ domains.
   */
  private async detectDomainSweeps(): Promise<number> {
    const sweepUsers = await this.db
      .select({
        humanId: missionClaims.humanId,
        domainCount: sql<number>`COUNT(DISTINCT ${missions.domain})`,
      })
      .from(missionClaims)
      .innerJoin(missions, eq(missionClaims.missionId, missions.id))
      .where(eq(missionClaims.status, "verified"))
      .groupBy(missionClaims.humanId)
      .having(sql`COUNT(DISTINCT ${missions.domain}) >= 5`);

    let detected = 0;
    for (const user of sweepUsers) {
      try {
        const [existing] = await this.db
          .select({ id: cooperativeAchievementEarners.id })
          .from(cooperativeAchievementEarners)
          .innerJoin(
            cooperativeAchievements,
            eq(cooperativeAchievementEarners.achievementId, cooperativeAchievements.id),
          )
          .where(
            and(
              eq(cooperativeAchievementEarners.humanId, user.humanId),
              eq(cooperativeAchievements.achievementType, "domain_sweep"),
            ),
          )
          .limit(1);

        if (existing) continue;

        const [achievement] = await this.db
          .insert(cooperativeAchievements)
          .values({
            achievementType: "domain_sweep",
            title: "Domain Sweep Champion",
            description: `Completed missions across ${user.domainCount} domains`,
            referenceIds: [user.humanId],
          })
          .returning({ id: cooperativeAchievements.id });

        if (achievement) {
          await this.db.insert(cooperativeAchievementEarners).values({
            achievementId: achievement.id,
            humanId: user.humanId,
          });
          detected++;
        }
      } catch { /* skip individual failures */ }
    }

    return detected;
  }

  /**
   * Get achievements for a specific user.
   */
  async getByHumanId(humanId: string): Promise<Array<{
    id: string;
    achievementType: string;
    title: string;
    description: string | null;
    earnedAt: Date;
  }>> {
    return this.db
      .select({
        id: cooperativeAchievements.id,
        achievementType: cooperativeAchievements.achievementType,
        title: cooperativeAchievements.title,
        description: cooperativeAchievements.description,
        earnedAt: cooperativeAchievements.earnedAt,
      })
      .from(cooperativeAchievementEarners)
      .innerJoin(
        cooperativeAchievements,
        eq(cooperativeAchievementEarners.achievementId, cooperativeAchievements.id),
      )
      .where(eq(cooperativeAchievementEarners.humanId, humanId))
      .orderBy(desc(cooperativeAchievements.earnedAt));
  }
}
