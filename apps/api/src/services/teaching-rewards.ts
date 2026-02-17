/**
 * Teaching Rewards Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Track teaching activity points and award Teacher badge at 20+ points:
 * - Mentorship completion: 5 points
 * - Help interaction: 2 points
 * - Case study contribution: 2 points
 * - Ambassador welcome: 1 point
 */
import { mentorships, missionHelpOffers, caseStudies, ambassadorAssignments } from "@betterworld/db";
import { and, eq, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

const TEACHER_BADGE_THRESHOLD = 20;

export class TeachingRewardsService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Calculate total teaching points for a user.
   */
  async getTeachingPoints(humanId: string): Promise<{
    total: number;
    mentorshipCompletions: number;
    helpInteractions: number;
    caseStudyContributions: number;
    ambassadorWelcomes: number;
    hasTeacherBadge: boolean;
  }> {
    // Count completed mentorships as mentor
    const [mentorCount] = await this.db
      .select({ count: count() })
      .from(mentorships)
      .where(
        and(
          eq(mentorships.mentorHumanId, humanId),
          eq(mentorships.status, "completed"),
        ),
      );
    const mentorshipCompletions = mentorCount?.count ?? 0;

    // Count accepted help offers
    const [helpCount] = await this.db
      .select({ count: count() })
      .from(missionHelpOffers)
      .where(
        and(
          eq(missionHelpOffers.helperHumanId, humanId),
          eq(missionHelpOffers.status, "accepted"),
        ),
      );
    const helpInteractions = helpCount?.count ?? 0;

    // Count case study contributions
    const caseStudyResult = await this.db
      .select({ contributorHumanIds: caseStudies.contributorHumanIds })
      .from(caseStudies)
      .where(eq(caseStudies.status, "published"));

    let caseStudyContributions = 0;
    for (const cs of caseStudyResult) {
      if (cs.contributorHumanIds?.includes(humanId)) {
        caseStudyContributions++;
      }
    }

    // Count ambassador welcomes
    const [ambassadorCount] = await this.db
      .select({ count: count() })
      .from(ambassadorAssignments)
      .where(
        and(
          eq(ambassadorAssignments.ambassadorHumanId, humanId),
          eq(ambassadorAssignments.tokenAwarded, true),
        ),
      );
    const ambassadorWelcomes = ambassadorCount?.count ?? 0;

    const total = (mentorshipCompletions * 5)
      + (helpInteractions * 2)
      + (caseStudyContributions * 2)
      + (ambassadorWelcomes * 1);

    return {
      total,
      mentorshipCompletions,
      helpInteractions,
      caseStudyContributions,
      ambassadorWelcomes,
      hasTeacherBadge: total >= TEACHER_BADGE_THRESHOLD,
    };
  }
}
