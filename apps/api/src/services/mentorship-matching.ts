/**
 * Mentorship Matching Service (Sprint 18: Cooperative Depth & Governance — US1)
 *
 * Matches newcomers with suitable mentors based on domain, city, tier, and capacity.
 * Scoring: sameCity ×3, higherTier ×2, fewerMentees ×1
 * Fallback chain: domain+city → domain → city → queue (any available)
 */
import { mentorships, humans, humanProfiles, reputationScores } from "@betterworld/db";
import type { MentorSuggestion } from "@betterworld/shared";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";


const logger = pino({ name: "mentorship-matching" });

/** Tier hierarchy for comparison */
const TIER_RANK: Record<string, number> = {
  newcomer: 0,
  contributor: 1,
  advocate: 2,
  leader: 3,
  champion: 4,
};

/** Maximum active mentees per mentor */
const MAX_MENTEES_PER_MENTOR = 3;

/** Minimum tier to be a mentor */
const MIN_MENTOR_TIER = "advocate";

export class MentorshipMatchingService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Get mentor suggestions for a mentee.
   * Returns top 3 scored mentors using fallback chain.
   */
  async getSuggestions(menteeHumanId: string): Promise<MentorSuggestion[]> {
    // Get mentee's profile info
    const [menteeProfile] = await this.db
      .select({
        city: humanProfiles.city,
        primaryDomain: humanProfiles.primaryDomain,
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, menteeHumanId))
      .limit(1);

    const [menteeTier] = await this.db
      .select({ currentTier: reputationScores.currentTier })
      .from(reputationScores)
      .where(eq(reputationScores.humanId, menteeHumanId))
      .limit(1);

    const menteeTierName = menteeTier?.currentTier ?? "newcomer";
    const menteeCity = menteeProfile?.city ?? null;
    const menteeDomain = menteeProfile?.primaryDomain ?? null;

    // Get IDs of humans who already have active/pending mentorships as mentor
    // and count how many mentees each has
    const activeMentorCounts = await this.db
      .select({
        mentorHumanId: mentorships.mentorHumanId,
        menteeCount: sql<number>`count(*)::int`,
      })
      .from(mentorships)
      .where(inArray(mentorships.status, ["pending", "active"]))
      .groupBy(mentorships.mentorHumanId);

    const mentorCountMap = new Map<string, number>();
    for (const row of activeMentorCounts) {
      mentorCountMap.set(row.mentorHumanId, row.menteeCount);
    }

    // Get eligible mentors: advocate+ tier, active, not the mentee, not at capacity
    const eligibleMentors = await this.db
      .select({
        humanId: humans.id,
        displayName: humans.displayName,
        city: humanProfiles.city,
        primaryDomain: humanProfiles.primaryDomain,
        currentTier: reputationScores.currentTier,
      })
      .from(humans)
      .innerJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
      .innerJoin(reputationScores, eq(humans.id, reputationScores.humanId))
      .where(
        and(
          eq(humans.isActive, true),
          ne(humans.id, menteeHumanId),
          inArray(reputationScores.currentTier, ["advocate", "leader", "champion"]),
        ),
      );

    // Filter by capacity
    const availableMentors = eligibleMentors.filter((m) => {
      const count = mentorCountMap.get(m.humanId) ?? 0;
      return count < MAX_MENTEES_PER_MENTOR;
    });

    if (availableMentors.length === 0) {
      logger.info({ menteeHumanId }, "No eligible mentors found");
      return [];
    }

    // Score each mentor
    const scored: Array<MentorSuggestion & { rawScore: number }> = availableMentors.map((m) => {
      let score = 0;
      const sharedDomain = menteeDomain !== null && m.primaryDomain === menteeDomain;
      const sameCity = menteeCity !== null && m.city === menteeCity;
      const menteeCount = mentorCountMap.get(m.humanId) ?? 0;

      // Domain match
      if (sharedDomain) score += 2;
      // City match
      if (sameCity) score += 3;
      // Higher tier bonus
      const mentorRank = TIER_RANK[m.currentTier] ?? 0;
      const menteeRank = TIER_RANK[menteeTierName] ?? 0;
      if (mentorRank > menteeRank) score += 2;
      // Fewer mentees (0 mentees = 1 point, 1 = 0.66, 2 = 0.33)
      score += Math.max(0, 1 - menteeCount / MAX_MENTEES_PER_MENTOR);

      return {
        humanId: m.humanId,
        displayName: m.displayName,
        tier: m.currentTier,
        primaryDomain: m.primaryDomain ?? null,
        city: m.city ?? null,
        activeMenteeCount: menteeCount,
        sharedDomain,
        sameCity,
        score: Math.round(score * 10) / 10,
        rawScore: score,
      };
    });

    // Sort by score descending, return top 3
    scored.sort((a, b) => b.rawScore - a.rawScore);
    const top3 = scored.slice(0, 3);

    logger.info(
      { menteeHumanId, totalEligible: availableMentors.length, returned: top3.length },
      "Mentor suggestions generated",
    );

    // Remove rawScore from output
    return top3.map(({ rawScore: _rawScore, ...rest }) => rest);
  }

  /**
   * Check if a mentee already has an active/pending mentorship.
   */
  async hasActiveMentorship(menteeHumanId: string): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: mentorships.id })
      .from(mentorships)
      .where(
        and(
          eq(mentorships.menteeHumanId, menteeHumanId),
          inArray(mentorships.status, ["pending", "active"]),
        ),
      )
      .limit(1);

    return !!existing;
  }

  /**
   * Count active mentees for a mentor.
   */
  async getActiveMenteeCount(mentorHumanId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(mentorships)
      .where(
        and(
          eq(mentorships.mentorHumanId, mentorHumanId),
          inArray(mentorships.status, ["pending", "active"]),
        ),
      );

    return result?.count ?? 0;
  }

  /**
   * Check if a human is eligible to be a mentor (advocate+ tier).
   */
  async isMentorEligible(humanId: string): Promise<boolean> {
    const [tier] = await this.db
      .select({ currentTier: reputationScores.currentTier })
      .from(reputationScores)
      .where(eq(reputationScores.humanId, humanId))
      .limit(1);

    if (!tier) return false;
    return (TIER_RANK[tier.currentTier] ?? 0) >= (TIER_RANK[MIN_MENTOR_TIER] ?? 0);
  }
}
