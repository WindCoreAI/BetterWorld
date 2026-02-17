/**
 * Cooperative Features Tests (Sprint 18: Cooperative Depth & Governance)
 *
 * Tests services and business logic for:
 * - Buddy rewards calculation
 * - Moderator eligibility
 * - Moderator audit
 * - Pathway progress
 * - Challenge scoring
 * - Cooperative achievements
 * - Teaching rewards
 * - Power audit (Gini coefficient)
 * - Agent fingerprint
 * - Circle metrics
 * - Feed scoring
 * - People discovery
 * - Welcome ambassador
 * - Network health
 */
import { describe, expect, it } from "vitest";

import { calculateRewardSplits } from "../services/buddy-rewards.js";

describe("Buddy Rewards Service", () => {
  describe("calculateRewardSplits", () => {
    it("should return 100% solo split", () => {
      const splits = calculateRewardSplits(10, "claimer-1");
      expect(splits).toHaveLength(1);
      expect(splits[0]!.humanId).toBe("claimer-1");
      expect(splits[0]!.amount).toBe(10);
    });

    it("should return 60/40 buddy split", () => {
      const splits = calculateRewardSplits(10, "claimer-1", "buddy-1");
      expect(splits).toHaveLength(2);
      expect(splits[0]!.humanId).toBe("claimer-1");
      expect(splits[0]!.amount).toBe(6); // 60%
      expect(splits[1]!.humanId).toBe("buddy-1");
      expect(splits[1]!.amount).toBe(4); // 40%
    });

    it("should return 75/25 helper split", () => {
      const splits = calculateRewardSplits(100, "claimer-1", null, "helper-1");
      expect(splits).toHaveLength(2);
      expect(splits[0]!.humanId).toBe("claimer-1");
      expect(splits[0]!.amount).toBe(75); // 75%
      expect(splits[1]!.humanId).toBe("helper-1");
      expect(splits[1]!.amount).toBe(25); // 25%
    });

    it("should return 45/30/25 buddy+helper split", () => {
      const splits = calculateRewardSplits(100, "claimer-1", "buddy-1", "helper-1");
      expect(splits).toHaveLength(3);
      expect(splits[0]!.humanId).toBe("claimer-1");
      expect(splits[0]!.amount).toBe(45); // 45%
      expect(splits[1]!.humanId).toBe("buddy-1");
      expect(splits[1]!.amount).toBe(30); // 30%
      expect(splits[2]!.humanId).toBe("helper-1");
      expect(splits[2]!.amount).toBe(25); // 25%
    });

    it("should handle small rewards without going negative", () => {
      const splits = calculateRewardSplits(1, "claimer-1", "buddy-1");
      const totalDistributed = splits.reduce((sum, s) => sum + s.amount, 0);
      expect(totalDistributed).toBe(1);
      for (const split of splits) {
        expect(split.amount).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe("Power Audit Service", () => {
  it("should export PowerAuditService class", async () => {
    const mod = await import("../services/power-audit.js");
    expect(mod.PowerAuditService).toBeDefined();
  });
});

describe("Cooperative Achievements Service", () => {
  it("should export CooperativeAchievementsService class", async () => {
    const mod = await import("../services/cooperative-achievements.js");
    expect(mod.CooperativeAchievementsService).toBeDefined();
  });
});

describe("Teaching Rewards Service", () => {
  it("should export TeachingRewardsService class", async () => {
    const mod = await import("../services/teaching-rewards.js");
    expect(mod.TeachingRewardsService).toBeDefined();
  });
});

describe("Agent Fingerprint Service", () => {
  it("should export AgentFingerprintService class", async () => {
    const mod = await import("../services/agent-fingerprint.js");
    expect(mod.AgentFingerprintService).toBeDefined();
  });
});

describe("Circle Metrics Service", () => {
  it("should export CircleMetricsService class", async () => {
    const mod = await import("../services/circle-metrics.js");
    expect(mod.CircleMetricsService).toBeDefined();
  });
});

describe("Feed Scoring Service", () => {
  it("should export FeedScoringService class", async () => {
    const mod = await import("../services/feed-scoring.js");
    expect(mod.FeedScoringService).toBeDefined();
  });
});

describe("People Discovery Service", () => {
  it("should export PeopleDiscoveryService class", async () => {
    const mod = await import("../services/people-discovery.js");
    expect(mod.PeopleDiscoveryService).toBeDefined();
  });
});

describe("Welcome Ambassador Service", () => {
  it("should export WelcomeAmbassadorService class", async () => {
    const mod = await import("../services/welcome-ambassador.js");
    expect(mod.WelcomeAmbassadorService).toBeDefined();
  });
});

describe("Network Health Service", () => {
  it("should export NetworkHealthService class", async () => {
    const mod = await import("../services/network-health.js");
    expect(mod.NetworkHealthService).toBeDefined();
  });
});

describe("Moderator Eligibility Service", () => {
  it("should export ModeratorEligibilityService class", async () => {
    const mod = await import("../services/moderator-eligibility.js");
    expect(mod.ModeratorEligibilityService).toBeDefined();
  });
});

describe("Moderator Audit Service", () => {
  it("should export ModeratorAuditService class", async () => {
    const mod = await import("../services/moderator-audit.js");
    expect(mod.ModeratorAuditService).toBeDefined();
  });
});

describe("Pathway Progress Service", () => {
  it("should export PathwayProgressService class", async () => {
    const mod = await import("../services/pathway-progress.js");
    expect(mod.PathwayProgressService).toBeDefined();
  });
});

describe("Challenge Scoring Service", () => {
  it("should export ChallengeScoringService class", async () => {
    const mod = await import("../services/challenge-scoring.js");
    expect(mod.ChallengeScoringService).toBeDefined();
  });
});

describe("Case Study Curation Service", () => {
  it("should export CaseStudyCurationService class", async () => {
    const mod = await import("../services/case-study-curation.js");
    expect(mod.CaseStudyCurationService).toBeDefined();
  });
});

describe("Worker Registration", () => {
  it("should export all Sprint 18 worker creators", async () => {
    const achievementMod = await import("../workers/achievement-detection-worker.js");
    expect(achievementMod.createAchievementDetectionWorker).toBeDefined();

    const powerAuditMod = await import("../workers/power-audit-worker.js");
    expect(powerAuditMod.createPowerAuditWorker).toBeDefined();

    const fingerprintMod = await import("../workers/agent-fingerprint-worker.js");
    expect(fingerprintMod.createAgentFingerprintWorker).toBeDefined();

    const feedMod = await import("../workers/feed-event-processor-worker.js");
    expect(feedMod.createFeedEventProcessorWorker).toBeDefined();

    const mentorMod = await import("../workers/mentorship-expiry-worker.js");
    expect(mentorMod.createMentorshipExpiryWorker).toBeDefined();

    const moderatorMod = await import("../workers/moderator-eligibility-worker.js");
    expect(moderatorMod.createModeratorEligibilityWorker).toBeDefined();

    const caseStudyMod = await import("../workers/case-study-curation-worker.js");
    expect(caseStudyMod.createCaseStudyCurationWorker).toBeDefined();
  });
});
