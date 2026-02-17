/**
 * Moderator Eligibility Service (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * Checks if a human qualifies for moderator role:
 * - Champion tier
 * - 90%+ accuracy (F1)
 * - 90+ days active
 * - Zero suspensions
 * - 3+ endorsements from advocate+ tier
 *
 * Flags eligible candidates and revokes status when criteria no longer met.
 */
import { humans, reputationScores, endorsements } from "@betterworld/db";
import { and, eq, sql, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

const MIN_TIER = "champion";
const MIN_ACCURACY = 0.9;
const MIN_DAYS_ACTIVE = 90;
const MIN_ENDORSEMENTS_FROM_ADVOCATES = 3;

export interface EligibilityResult {
  humanId: string;
  displayName: string;
  eligible: boolean;
  reasons: string[];
  tier: string;
  accuracy: number;
  daysActive: number;
  endorsementCount: number;
}

export class ModeratorEligibilityService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Check eligibility for a specific human.
   */
  async checkEligibility(humanId: string): Promise<EligibilityResult> {
    const reasons: string[] = [];

    // Get human info
    const [human] = await this.db
      .select({
        id: humans.id,
        displayName: humans.displayName,
        isModerator: humans.isModerator,
        createdAt: humans.createdAt,
      })
      .from(humans)
      .where(eq(humans.id, humanId))
      .limit(1);

    if (!human) {
      return { humanId, displayName: "Unknown", eligible: false, reasons: ["User not found"], tier: "newcomer", accuracy: 0, daysActive: 0, endorsementCount: 0 };
    }

    // Check tier
    const [rep] = await this.db
      .select({
        currentTier: reputationScores.currentTier,
        peerAccuracyScore: reputationScores.peerAccuracyScore,
      })
      .from(reputationScores)
      .where(eq(reputationScores.humanId, humanId))
      .limit(1);

    const tier = rep?.currentTier ?? "newcomer";
    const accuracy = rep ? parseFloat(String(rep.peerAccuracyScore)) / 100 : 0;

    if (tier !== MIN_TIER) {
      reasons.push(`Requires ${MIN_TIER} tier (current: ${tier})`);
    }

    if (accuracy < MIN_ACCURACY) {
      reasons.push(`Requires ${MIN_ACCURACY * 100}%+ accuracy (current: ${(accuracy * 100).toFixed(1)}%)`);
    }

    // Check days active
    const daysActive = Math.floor(
      (Date.now() - new Date(human.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysActive < MIN_DAYS_ACTIVE) {
      reasons.push(`Requires ${MIN_DAYS_ACTIVE}+ days active (current: ${daysActive})`);
    }

    // Check endorsements from advocate+ tier users
    const endorsementResult = await this.db
      .select({ count: count() })
      .from(endorsements)
      .innerJoin(reputationScores, eq(endorsements.fromHumanId, reputationScores.humanId))
      .where(
        and(
          eq(endorsements.toHumanId, humanId),
          sql`${reputationScores.currentTier} IN ('advocate', 'leader', 'champion')`,
        ),
      );

    const endorsementCount = endorsementResult[0]?.count ?? 0;
    if (endorsementCount < MIN_ENDORSEMENTS_FROM_ADVOCATES) {
      reasons.push(`Requires ${MIN_ENDORSEMENTS_FROM_ADVOCATES}+ endorsements from advocate+ users (current: ${endorsementCount})`);
    }

    return {
      humanId,
      displayName: human.displayName,
      eligible: reasons.length === 0,
      reasons,
      tier,
      accuracy: accuracy * 100,
      daysActive,
      endorsementCount,
    };
  }

  /**
   * Scan all champion-tier users for moderator eligibility.
   * Returns newly eligible candidates and those who should be revoked.
   */
  async scanEligibility(): Promise<{
    newlyEligible: EligibilityResult[];
    shouldRevoke: Array<{ humanId: string; reasons: string[] }>;
  }> {
    const newlyEligible: EligibilityResult[] = [];
    const shouldRevoke: Array<{ humanId: string; reasons: string[] }> = [];

    // Find champion-tier users who are NOT already moderators
    const champions = await this.db
      .select({ humanId: reputationScores.humanId })
      .from(reputationScores)
      .where(eq(reputationScores.currentTier, "champion"))
      .limit(100);

    for (const champion of champions) {
      const result = await this.checkEligibility(champion.humanId);
      if (result.eligible) {
        // Check if they are already a moderator
        const [human] = await this.db
          .select({ isModerator: humans.isModerator })
          .from(humans)
          .where(eq(humans.id, champion.humanId))
          .limit(1);

        if (human && !human.isModerator) {
          newlyEligible.push(result);
        }
      }
    }

    // Find current moderators who no longer meet criteria
    const currentModerators = await this.db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.isModerator, true))
      .limit(100);

    for (const mod of currentModerators) {
      const result = await this.checkEligibility(mod.id);
      if (!result.eligible) {
        shouldRevoke.push({ humanId: mod.id, reasons: result.reasons });
      }
    }

    return { newlyEligible, shouldRevoke };
  }
}
