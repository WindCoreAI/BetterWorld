/**
 * Challenge Scoring Service (Sprint 18: Cooperative Depth & Governance — US8)
 *
 * Per-capita scoring for city-vs-city challenges.
 * Target tracking for domain sprint challenges.
 * Cross-pollination detection.
 */
import { challengeParticipants } from "@betterworld/db";
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export class ChallengeScoringService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Update a participant's score in a challenge.
   */
  async incrementScore(
    challengeId: string,
    humanId: string,
    points: number,
  ): Promise<void> {
    const [participant] = await this.db
      .select({ id: challengeParticipants.id, score: challengeParticipants.score })
      .from(challengeParticipants)
      .where(
        and(
          eq(challengeParticipants.challengeId, challengeId),
          eq(challengeParticipants.humanId, humanId),
        ),
      )
      .limit(1);

    if (!participant) return;

    const currentScore = parseFloat(String(participant.score)) || 0;
    await this.db
      .update(challengeParticipants)
      .set({ score: String(currentScore + points) })
      .where(eq(challengeParticipants.id, participant.id));
  }

  /**
   * Get leaderboard for a challenge, grouped by group value with per-capita scoring.
   */
  async getLeaderboard(challengeId: string): Promise<Array<{
    groupValue: string;
    groupType: string;
    totalScore: number;
    participantCount: number;
    perCapitaScore: number;
  }>> {
    const results = await this.db
      .select({
        groupValue: challengeParticipants.groupValue,
        groupType: challengeParticipants.groupType,
        totalScore: sql<string>`SUM(${challengeParticipants.score}::numeric)`,
        participantCount: sql<number>`COUNT(*)`,
      })
      .from(challengeParticipants)
      .where(eq(challengeParticipants.challengeId, challengeId))
      .groupBy(challengeParticipants.groupValue, challengeParticipants.groupType);

    return results.map((r) => {
      const total = parseFloat(String(r.totalScore)) || 0;
      const count = Number(r.participantCount) || 1;
      return {
        groupValue: r.groupValue,
        groupType: r.groupType,
        totalScore: total,
        participantCount: count,
        perCapitaScore: Math.round((total / count) * 100) / 100,
      };
    }).sort((a, b) => b.perCapitaScore - a.perCapitaScore);
  }
}
