/* eslint-disable no-console */
/**
 * Backfill reputation scores, streaks, and fraud scores for existing humans.
 *
 * Run with: npx tsx packages/db/src/seed/backfill-reputation.ts
 *
 * Idempotent: uses onConflictDoNothing() for all inserts.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { fraudScores, humans, reputationScores, streaks } from "../schema/index";

export async function backfillReputation(
  db: PostgresJsDatabase,
): Promise<{ reputation: number; streaks: number; fraud: number }> {
  console.log("Starting reputation backfill...");

  // Get all human IDs
  const allHumans = await db
    .select({ id: humans.id })
    .from(humans);

  console.log(`Found ${allHumans.length} humans to backfill`);

  let repCount = 0;
  let streakCount = 0;
  let fraudCount = 0;

  for (const human of allHumans) {
    // Insert default reputation score
    const [repRow] = await db
      .insert(reputationScores)
      .values({
        humanId: human.id,
        totalScore: "0",
        missionQualityScore: "0",
        peerAccuracyScore: "0",
        streakScore: "0",
        endorsementScore: "0",
        currentTier: "newcomer",
        tierMultiplier: "1.0",
      })
      .onConflictDoNothing({ target: reputationScores.humanId })
      .returning();
    if (repRow) repCount++;

    // Insert default streak
    const [streakRow] = await db
      .insert(streaks)
      .values({
        humanId: human.id,
        currentStreak: 0,
        longestStreak: 0,
        streakMultiplier: "1.0",
        freezeAvailable: true,
      })
      .onConflictDoNothing({ target: streaks.humanId })
      .returning();
    if (streakRow) streakCount++;

    // Insert default fraud score
    const [fraudRow] = await db
      .insert(fraudScores)
      .values({
        humanId: human.id,
        totalScore: 0,
        phashScore: 0,
        velocityScore: 0,
        statisticalScore: 0,
        status: "clean",
      })
      .onConflictDoNothing({ target: fraudScores.humanId })
      .returning();
    if (fraudRow) fraudCount++;
  }

  console.log(`Backfilled: ${repCount} reputation scores, ${streakCount} streaks, ${fraudCount} fraud scores`);

  return { reputation: repCount, streaks: streakCount, fraud: fraudCount };
}
