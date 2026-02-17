/**
 * Welcome Ambassador Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Selects rotating ambassador (advocate+ in newcomer's domain/city)
 * and assigns them to greet newcomers during onboarding completion.
 */
import { ambassadorAssignments, humans, humanProfiles, reputationScores } from "@betterworld/db";
import { and, eq, sql, count, gte, ne, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "welcome-ambassador" });

const MAX_MONTHLY_WELCOMES = 5;

export class WelcomeAmbassadorService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Select and assign an ambassador to a newcomer.
   * Called during onboarding completion.
   */
  async assignAmbassador(
    newcomerHumanId: string,
    domain?: string,
    city?: string,
  ): Promise<{ ambassadorHumanId: string } | null> {
    // Check if newcomer already has an ambassador
    const [existing] = await this.db
      .select({ id: ambassadorAssignments.id })
      .from(ambassadorAssignments)
      .where(eq(ambassadorAssignments.newcomerHumanId, newcomerHumanId))
      .limit(1);

    if (existing) {
      logger.info({ newcomerHumanId }, "Newcomer already has an ambassador");
      return null;
    }

    // Find eligible ambassadors (advocate+ tier, active, not at monthly cap)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Build conditions for eligible ambassadors
    const conditions = [
      eq(humans.isActive, true),
      ne(humans.id, newcomerHumanId),
      sql`${reputationScores.currentTier} IN ('advocate', 'leader', 'champion')`,
    ];

    if (domain) {
      conditions.push(eq(humanProfiles.primaryDomain, domain as never));
    }
    if (city) {
      conditions.push(sql`lower(${humanProfiles.city}) = lower(${city})`);
    }

    // Get candidates with their monthly welcome count
    const candidates = await this.db
      .select({
        humanId: humans.id,
        displayName: humans.displayName,
        tier: reputationScores.currentTier,
      })
      .from(humans)
      .innerJoin(reputationScores, eq(humans.id, reputationScores.humanId))
      .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
      .where(and(...conditions))
      .orderBy(desc(reputationScores.totalScore))
      .limit(20);

    // Filter by monthly cap
    for (const candidate of candidates) {
      const [monthlyCount] = await this.db
        .select({ count: count() })
        .from(ambassadorAssignments)
        .where(
          and(
            eq(ambassadorAssignments.ambassadorHumanId, candidate.humanId),
            eq(ambassadorAssignments.tokenAwarded, true),
            gte(ambassadorAssignments.createdAt, monthStart),
          ),
        );

      if ((monthlyCount?.count ?? 0) < MAX_MONTHLY_WELCOMES) {
        // Assign this ambassador
        await this.db.insert(ambassadorAssignments).values({
          ambassadorHumanId: candidate.humanId,
          newcomerHumanId,
        });

        logger.info(
          { ambassadorHumanId: candidate.humanId, newcomerHumanId },
          "Ambassador assigned",
        );

        return { ambassadorHumanId: candidate.humanId };
      }
    }

    // Fallback: try without domain/city filters
    if (domain || city) {
      return this.assignAmbassador(newcomerHumanId);
    }

    logger.info({ newcomerHumanId }, "No eligible ambassador found");
    return null;
  }
}
