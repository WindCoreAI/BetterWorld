import { afterEach, describe, it, expect } from "vitest";
import { determineTrustTier, getThresholds, resolveTrustTier } from "../../src/trust/trust-tier";

describe("Trust Tier Logic", () => {
  describe("determineTrustTier", () => {
    it("should return 'new' for fresh agent (0 days, 0 approvals)", () => {
      expect(determineTrustTier(0, 0)).toBe("new");
    });

    it("should return 'new' for agent with enough age but insufficient approvals", () => {
      expect(determineTrustTier(10, 2)).toBe("new");
    });

    it("should return 'new' for agent with enough approvals but insufficient age", () => {
      expect(determineTrustTier(5, 5)).toBe("new");
    });

    it("should return 'verified' for agent meeting both criteria", () => {
      expect(determineTrustTier(8, 3)).toBe("verified");
    });

    it("should return 'verified' for agent exceeding both criteria", () => {
      expect(determineTrustTier(30, 10)).toBe("verified");
    });

    it("should return 'new' for agent at boundary (7 days, 3 approvals)", () => {
      expect(determineTrustTier(7, 3)).toBe("new");
    });

    it("should return 'new' for agent at boundary (8 days, 2 approvals)", () => {
      expect(determineTrustTier(8, 2)).toBe("new");
    });

    it("should return 'verified' at exact boundary (8 days, 3 approvals)", () => {
      expect(determineTrustTier(8, 3)).toBe("verified");
    });

    it("should handle very old agent with no approvals", () => {
      expect(determineTrustTier(365, 0)).toBe("new");
    });

    it("should handle very active new agent", () => {
      expect(determineTrustTier(1, 100)).toBe("new");
    });
  });

  describe("getThresholds", () => {
    describe("new tier", () => {
      it("should return autoApprove of 1.0 (nothing auto-approves)", () => {
        const thresholds = getThresholds("new");
        expect(thresholds.autoApprove).toBe(1.0);
      });

      it("should return autoFlagMin of 0.0 (everything above reject threshold is flagged)", () => {
        const thresholds = getThresholds("new");
        expect(thresholds.autoFlagMin).toBe(0.0);
      });

      it("should return autoRejectMax of 0.0 (nothing auto-rejected, all goes to human review)", () => {
        const thresholds = getThresholds("new");
        expect(thresholds.autoRejectMax).toBe(0.0);
      });

      it("should mean all scores 0.0-1.0 are flagged for human review", () => {
        const t = getThresholds("new");
        // Score 0.85 for new agent: 0.85 >= 1.0 (autoApprove)? No. >= 0.0 (autoRejectMax)? Yes → flagged
        expect(0.85 >= t.autoApprove).toBe(false);
        expect(0.85 >= t.autoRejectMax).toBe(true);
        // Score 0.3: 0.3 >= 0.0 → flagged (not rejected)
        expect(0.3 >= t.autoRejectMax).toBe(true);
      });
    });

    describe("verified tier", () => {
      it("should return autoApprove of 0.7", () => {
        const thresholds = getThresholds("verified");
        expect(thresholds.autoApprove).toBe(0.7);
      });

      it("should return autoFlagMin of 0.4", () => {
        const thresholds = getThresholds("verified");
        expect(thresholds.autoFlagMin).toBe(0.4);
      });

      it("should return autoRejectMax of 0.4", () => {
        const thresholds = getThresholds("verified");
        expect(thresholds.autoRejectMax).toBe(0.4);
      });

      it("should mean scores >=0.7 approved, 0.4-0.7 flagged, <0.4 rejected", () => {
        const t = getThresholds("verified");
        // Score 0.85 → approved
        expect(0.85 >= t.autoApprove).toBe(true);
        // Score 0.55 → flagged
        expect(0.55 >= t.autoApprove).toBe(false);
        expect(0.55 >= t.autoRejectMax).toBe(true);
        // Score 0.3 → rejected
        expect(0.3 < t.autoRejectMax).toBe(true);
      });
    });
  });

  describe("Trust Tier Decision Matrix", () => {
    const scoreCases = [
      { score: 0.0, newDecision: "flagged", verifiedDecision: "rejected" },
      { score: 0.2, newDecision: "flagged", verifiedDecision: "rejected" },
      { score: 0.39, newDecision: "flagged", verifiedDecision: "rejected" },
      { score: 0.4, newDecision: "flagged", verifiedDecision: "flagged" },
      { score: 0.55, newDecision: "flagged", verifiedDecision: "flagged" },
      { score: 0.69, newDecision: "flagged", verifiedDecision: "flagged" },
      { score: 0.7, newDecision: "flagged", verifiedDecision: "approved" },
      { score: 0.85, newDecision: "flagged", verifiedDecision: "approved" },
      { score: 1.0, newDecision: "approved", verifiedDecision: "approved" },
    ];

    function applyThresholds(
      score: number,
      thresholds: ReturnType<typeof getThresholds>,
    ): string {
      if (score >= thresholds.autoApprove) return "approved";
      if (score >= thresholds.autoRejectMax) return "flagged";
      return "rejected";
    }

    it.each(scoreCases)(
      "score $score: new→$newDecision, verified→$verifiedDecision",
      ({ score, newDecision, verifiedDecision }) => {
        const newThresholds = getThresholds("new");
        const verifiedThresholds = getThresholds("verified");

        expect(applyThresholds(score, newThresholds)).toBe(newDecision);
        expect(applyThresholds(score, verifiedThresholds)).toBe(verifiedDecision);
      },
    );
  });

  describe("resolveTrustTier (the tier the pipeline actually uses)", () => {
    afterEach(() => {
      delete process.env.TRUST_OWNER_VERIFIED_MIN_APPROVALS;
    });

    it("gives an agent with a verified owner standard thresholds from its first submission", () => {
      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 0, ownerVerified: true })).toBe("verified");
    });

    it("keeps an agent without a verified owner in review until it has earned the tier", () => {
      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 0, ownerVerified: false })).toBe("new");
      expect(resolveTrustTier({ accountAgeDays: 30, approvedSubmissions: 2, ownerVerified: false })).toBe("new");
      expect(resolveTrustTier({ accountAgeDays: 5, approvedSubmissions: 10, ownerVerified: false })).toBe("new");
    });

    it("lets an agent without a verified owner earn the tier through age and approvals", () => {
      expect(resolveTrustTier({ accountAgeDays: 8, approvedSubmissions: 3, ownerVerified: false })).toBe("verified");
    });

    it("supports a human-reviewed probation for owner-verified agents via TRUST_OWNER_VERIFIED_MIN_APPROVALS", () => {
      process.env.TRUST_OWNER_VERIFIED_MIN_APPROVALS = "3";

      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 0, ownerVerified: true })).toBe("new");
      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 2, ownerVerified: true })).toBe("new");
      // …and the probation ends on approvals alone: no waiting period for an accountable owner
      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 3, ownerVerified: true })).toBe("verified");
    });

    it("ignores a nonsensical probation setting", () => {
      process.env.TRUST_OWNER_VERIFIED_MIN_APPROVALS = "not-a-number";
      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 0, ownerVerified: true })).toBe("verified");
      process.env.TRUST_OWNER_VERIFIED_MIN_APPROVALS = "-2";
      expect(resolveTrustTier({ accountAgeDays: 0, approvedSubmissions: 0, ownerVerified: true })).toBe("verified");
    });
  });
});
