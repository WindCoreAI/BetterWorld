/**
 * Pathway Progress Service (Sprint 18: Cooperative Depth & Governance — US6)
 *
 * Computes progress for each pathway level's requirements:
 * - Observer: 0 missions (entry level)
 * - Participant: 3 missions, 2 types, 1 peer review
 * - Specialist: 10 missions, 3 types, 5 reviews, 80% accuracy, 1 debate
 * - Expert: 25 missions, 4 types, 15 reviews, 90% accuracy, 3 debates, 2 cross-city, 3 case studies
 *
 * Auto-advances on level completion and triggers celebration notifications.
 */
import { learningPathways } from "@betterworld/db";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { NotificationService } from "./notification.service.js";

const logger = pino({ name: "pathway-progress" });

interface LevelRequirements {
  missionsRequired: number;
  missionTypesRequired: number;
  reviewsRequired: number;
  accuracyRequired: number;
  debatesRequired: number;
  crossCityRequired: number;
  caseStudiesRequired: number;
}

const LEVEL_REQUIREMENTS: Record<string, LevelRequirements> = {
  observer: { missionsRequired: 0, missionTypesRequired: 0, reviewsRequired: 0, accuracyRequired: 0, debatesRequired: 0, crossCityRequired: 0, caseStudiesRequired: 0 },
  participant: { missionsRequired: 3, missionTypesRequired: 2, reviewsRequired: 1, accuracyRequired: 0, debatesRequired: 0, crossCityRequired: 0, caseStudiesRequired: 0 },
  specialist: { missionsRequired: 10, missionTypesRequired: 3, reviewsRequired: 5, accuracyRequired: 80, debatesRequired: 1, crossCityRequired: 0, caseStudiesRequired: 0 },
  expert: { missionsRequired: 25, missionTypesRequired: 4, reviewsRequired: 15, accuracyRequired: 90, debatesRequired: 3, crossCityRequired: 2, caseStudiesRequired: 3 },
};

const LEVEL_ORDER = ["observer", "participant", "specialist", "expert"];

export class PathwayProgressService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Get detailed progress for a pathway.
   */
  async getProgress(pathwayId: string): Promise<{
    currentLevel: string;
    nextLevel: string | null;
    progressPercent: number;
    requirements: Record<string, { current: number; required: number; met: boolean }>;
  }> {
    const [pathway] = await this.db
      .select()
      .from(learningPathways)
      .where(eq(learningPathways.id, pathwayId))
      .limit(1);

    if (!pathway) {
      throw new Error("Pathway not found");
    }

    const currentLevel = pathway.currentLevel;
    const currentIdx = LEVEL_ORDER.indexOf(currentLevel);
    const nextLevel = currentIdx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[currentIdx + 1]! : null;

    if (!nextLevel) {
      return {
        currentLevel,
        nextLevel: null,
        progressPercent: 100,
        requirements: {},
      };
    }

    const reqs = LEVEL_REQUIREMENTS[nextLevel]!;
    const accuracy = pathway.reviewAccuracy ? parseFloat(String(pathway.reviewAccuracy)) * 100 : 0;

    const requirements: Record<string, { current: number; required: number; met: boolean }> = {
      missions: { current: pathway.missionsCompleted, required: reqs.missionsRequired, met: pathway.missionsCompleted >= reqs.missionsRequired },
      missionTypes: { current: pathway.missionTypesCount, required: reqs.missionTypesRequired, met: pathway.missionTypesCount >= reqs.missionTypesRequired },
      reviews: { current: pathway.peerReviewsCompleted, required: reqs.reviewsRequired, met: pathway.peerReviewsCompleted >= reqs.reviewsRequired },
      accuracy: { current: accuracy, required: reqs.accuracyRequired, met: accuracy >= reqs.accuracyRequired },
      debates: { current: pathway.debatesParticipated, required: reqs.debatesRequired, met: pathway.debatesParticipated >= reqs.debatesRequired },
      crossCity: { current: pathway.crossCityMissions, required: reqs.crossCityRequired, met: pathway.crossCityMissions >= reqs.crossCityRequired },
      caseStudies: { current: pathway.caseStudiesRead, required: reqs.caseStudiesRequired, met: pathway.caseStudiesRead >= reqs.caseStudiesRequired },
    };

    // Calculate progress as % of requirements met
    const totalReqs = Object.values(requirements).filter((r) => r.required > 0).length;
    const metReqs = Object.values(requirements).filter((r) => r.required > 0 && r.met).length;
    const progressPercent = totalReqs > 0 ? Math.round((metReqs / totalReqs) * 100) : 100;

    return { currentLevel, nextLevel, progressPercent, requirements };
  }

  /**
   * Update pathway on mission completion.
   */
  async updateOnMissionComplete(humanId: string, domain: string): Promise<void> {
    const [pathway] = await this.db
      .select()
      .from(learningPathways)
      .where(
        and(
          eq(learningPathways.humanId, humanId),
          eq(learningPathways.domain, domain as never),
        ),
      )
      .limit(1);

    if (!pathway) return; // Not enrolled

    await this.db
      .update(learningPathways)
      .set({
        missionsCompleted: pathway.missionsCompleted + 1,
        updatedAt: new Date(),
      })
      .where(eq(learningPathways.id, pathway.id));

    await this.checkAndAdvance(pathway.id, humanId);
  }

  /**
   * Update pathway on peer review submission.
   */
  async updateOnReviewSubmit(humanId: string, domain: string): Promise<void> {
    const [pathway] = await this.db
      .select()
      .from(learningPathways)
      .where(
        and(
          eq(learningPathways.humanId, humanId),
          eq(learningPathways.domain, domain as never),
        ),
      )
      .limit(1);

    if (!pathway) return;

    await this.db
      .update(learningPathways)
      .set({
        peerReviewsCompleted: pathway.peerReviewsCompleted + 1,
        updatedAt: new Date(),
      })
      .where(eq(learningPathways.id, pathway.id));

    await this.checkAndAdvance(pathway.id, humanId);
  }

  /**
   * Update pathway on debate participation.
   */
  async updateOnDebateParticipation(humanId: string, domain: string): Promise<void> {
    const [pathway] = await this.db
      .select()
      .from(learningPathways)
      .where(
        and(
          eq(learningPathways.humanId, humanId),
          eq(learningPathways.domain, domain as never),
        ),
      )
      .limit(1);

    if (!pathway) return;

    await this.db
      .update(learningPathways)
      .set({
        debatesParticipated: pathway.debatesParticipated + 1,
        updatedAt: new Date(),
      })
      .where(eq(learningPathways.id, pathway.id));

    await this.checkAndAdvance(pathway.id, humanId);
  }

  /**
   * Check if user qualifies for level advancement.
   */
  private async checkAndAdvance(pathwayId: string, humanId: string): Promise<void> {
    const progress = await this.getProgress(pathwayId);

    if (!progress.nextLevel) return;

    const allMet = Object.values(progress.requirements).every(
      (r) => r.required === 0 || r.met,
    );

    if (allMet) {
      await this.db
        .update(learningPathways)
        .set({
          currentLevel: progress.nextLevel as never,
          levelReachedAt: new Date(),
          progressPercent: 0,
          updatedAt: new Date(),
        })
        .where(eq(learningPathways.id, pathwayId));

      // Send celebration notification
      try {
        const notificationService = new NotificationService(this.db);
        await notificationService.create({
          recipientHumanId: humanId,
          type: "pathway_level_up",
          message: `You advanced to ${progress.nextLevel} level in your learning pathway!`,
          referenceId: pathwayId,
          referenceType: "learning_pathway",
        });
      } catch { /* non-fatal */ }

      logger.info({ pathwayId, humanId, newLevel: progress.nextLevel }, "Pathway level-up");
    }
  }
}
