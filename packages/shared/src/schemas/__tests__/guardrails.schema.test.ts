import { describe, it, expect } from "vitest";

import {
  contentTypeSchema,
  guardrailDecisionSchema,
  layerAResultSchema,
  layerBResultSchema,
  evaluationRequestSchema,
  flaggedContentListParamsSchema,
  adminReviewDecisionSchema,
  trustTierThresholdsSchema,
} from "../guardrails";

describe("Guardrail Schemas", () => {
  describe("contentTypeSchema", () => {
    it.each(["problem", "solution", "debate"])("accepts '%s'", (val) => {
      expect(contentTypeSchema.safeParse(val).success).toBe(true);
    });

    it.each(["forum_post", "comment", "", "PROBLEM", "Problem"])(
      "rejects '%s'",
      (val) => {
        expect(contentTypeSchema.safeParse(val).success).toBe(false);
      },
    );
  });

  describe("guardrailDecisionSchema", () => {
    it.each(["approved", "flagged", "rejected"])("accepts '%s'", (val) => {
      expect(guardrailDecisionSchema.safeParse(val).success).toBe(true);
    });

    it.each(["pending", "banned", ""])(
      "rejects '%s'",
      (val) => {
        expect(guardrailDecisionSchema.safeParse(val).success).toBe(false);
      },
    );
  });

  describe("layerAResultSchema", () => {
    it("accepts valid result with empty patterns", () => {
      const result = layerAResultSchema.safeParse({
        passed: true,
        forbiddenPatterns: [],
        executionTimeMs: 2,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid result with detected patterns", () => {
      const result = layerAResultSchema.safeParse({
        passed: false,
        forbiddenPatterns: ["weapons", "surveillance"],
        executionTimeMs: 5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative executionTimeMs", () => {
      const result = layerAResultSchema.safeParse({
        passed: true,
        forbiddenPatterns: [],
        executionTimeMs: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer executionTimeMs", () => {
      const result = layerAResultSchema.safeParse({
        passed: true,
        forbiddenPatterns: [],
        executionTimeMs: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing passed field", () => {
      const result = layerAResultSchema.safeParse({
        forbiddenPatterns: [],
        executionTimeMs: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("layerBResultSchema", () => {
    const validResult = {
      alignedDomain: "food_security",
      alignmentScore: 0.85,
      harmRisk: "low",
      feasibility: "high",
      quality: "Good problem statement with clear scope",
      decision: "approve",
      reasoning: "This is a legitimate food security initiative aligned with UN SDGs",
    };

    it("accepts valid complete result", () => {
      expect(layerBResultSchema.safeParse(validResult).success).toBe(true);
    });

    it("accepts score at boundary 0.0", () => {
      const result = layerBResultSchema.safeParse({ ...validResult, alignmentScore: 0.0 });
      expect(result.success).toBe(true);
    });

    it("accepts score at boundary 1.0", () => {
      const result = layerBResultSchema.safeParse({ ...validResult, alignmentScore: 1.0 });
      expect(result.success).toBe(true);
    });

    it("rejects score above 1.0", () => {
      const result = layerBResultSchema.safeParse({ ...validResult, alignmentScore: 1.01 });
      expect(result.success).toBe(false);
    });

    it("rejects negative score", () => {
      const result = layerBResultSchema.safeParse({ ...validResult, alignmentScore: -0.1 });
      expect(result.success).toBe(false);
    });

    it.each(["low", "medium", "high"])("accepts harmRisk '%s'", (val) => {
      expect(
        layerBResultSchema.safeParse({ ...validResult, harmRisk: val }).success,
      ).toBe(true);
    });

    it("rejects invalid harmRisk", () => {
      expect(
        layerBResultSchema.safeParse({ ...validResult, harmRisk: "critical" }).success,
      ).toBe(false);
    });

    it.each(["approve", "flag", "reject"])("accepts decision '%s'", (val) => {
      expect(
        layerBResultSchema.safeParse({ ...validResult, decision: val }).success,
      ).toBe(true);
    });

    it("rejects invalid decision", () => {
      expect(
        layerBResultSchema.safeParse({ ...validResult, decision: "approved" }).success,
      ).toBe(false);
    });

    it("rejects reasoning shorter than 10 chars", () => {
      expect(
        layerBResultSchema.safeParse({ ...validResult, reasoning: "Too short" }).success,
      ).toBe(false);
    });

    it("rejects empty alignedDomain", () => {
      expect(
        layerBResultSchema.safeParse({ ...validResult, alignedDomain: "" }).success,
      ).toBe(false);
    });
  });

  describe("evaluationRequestSchema", () => {
    const validRequest = {
      contentType: "problem",
      contentId: "550e8400-e29b-41d4-a716-446655440000",
      content: { title: "Test", description: "A test problem" },
    };

    it("accepts valid request", () => {
      expect(evaluationRequestSchema.safeParse(validRequest).success).toBe(true);
    });

    it("accepts empty content object", () => {
      expect(
        evaluationRequestSchema.safeParse({ ...validRequest, content: {} }).success,
      ).toBe(true);
    });

    it("accepts nested content object", () => {
      const result = evaluationRequestSchema.safeParse({
        ...validRequest,
        content: { meta: { nested: { deep: true } } },
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-UUID contentId", () => {
      expect(
        evaluationRequestSchema.safeParse({ ...validRequest, contentId: "not-uuid" }).success,
      ).toBe(false);
    });

    it("rejects invalid contentType", () => {
      expect(
        evaluationRequestSchema.safeParse({ ...validRequest, contentType: "forum" }).success,
      ).toBe(false);
    });

    it("rejects missing content field", () => {
      const { content: _, ...noContent } = validRequest;
      expect(evaluationRequestSchema.safeParse(noContent).success).toBe(false);
    });

    it("rejects missing contentType", () => {
      const { contentType: _, ...noType } = validRequest;
      expect(evaluationRequestSchema.safeParse(noType).success).toBe(false);
    });
  });

  describe("flaggedContentListParamsSchema", () => {
    it("accepts empty params (all defaults)", () => {
      const result = flaggedContentListParamsSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        status: "pending_review",
        contentType: "all",
        limit: 20,
      });
    });

    it("accepts all valid status values", () => {
      for (const status of ["pending_review", "approved", "rejected", "all"]) {
        expect(
          flaggedContentListParamsSchema.safeParse({ status }).success,
        ).toBe(true);
      }
    });

    it("accepts all valid contentType values", () => {
      for (const contentType of ["problem", "solution", "debate", "all"]) {
        expect(
          flaggedContentListParamsSchema.safeParse({ contentType }).success,
        ).toBe(true);
      }
    });

    it("accepts limit at min boundary (1)", () => {
      const result = flaggedContentListParamsSchema.safeParse({ limit: "1" });
      expect(result.success).toBe(true);
      expect(result.data!.limit).toBe(1);
    });

    it("accepts limit at max boundary (100)", () => {
      const result = flaggedContentListParamsSchema.safeParse({ limit: "100" });
      expect(result.success).toBe(true);
      expect(result.data!.limit).toBe(100);
    });

    it("rejects limit of 0", () => {
      expect(
        flaggedContentListParamsSchema.safeParse({ limit: "0" }).success,
      ).toBe(false);
    });

    it("rejects limit exceeding 100", () => {
      expect(
        flaggedContentListParamsSchema.safeParse({ limit: "101" }).success,
      ).toBe(false);
    });

    it("rejects invalid status", () => {
      expect(
        flaggedContentListParamsSchema.safeParse({ status: "deleted" }).success,
      ).toBe(false);
    });

    it("accepts cursor string", () => {
      const result = flaggedContentListParamsSchema.safeParse({
        cursor: "2026-02-08T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("coerces string limit to number", () => {
      const result = flaggedContentListParamsSchema.safeParse({ limit: "50" });
      expect(result.success).toBe(true);
      expect(result.data!.limit).toBe(50);
    });
  });

  describe("adminReviewDecisionSchema", () => {
    it("accepts valid approve decision", () => {
      const result = adminReviewDecisionSchema.safeParse({
        decision: "approve",
        notes: "Content reviewed and approved as legitimate initiative",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid reject decision", () => {
      const result = adminReviewDecisionSchema.safeParse({
        decision: "reject",
        notes: "Content raises significant privacy and safety concerns",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid decision value", () => {
      expect(
        adminReviewDecisionSchema.safeParse({
          decision: "flag",
          notes: "Should be flagged for more review",
        }).success,
      ).toBe(false);
    });

    it("rejects notes shorter than 10 characters", () => {
      expect(
        adminReviewDecisionSchema.safeParse({
          decision: "approve",
          notes: "Too short",
        }).success,
      ).toBe(false);
    });

    it("accepts notes at exactly 10 characters", () => {
      expect(
        adminReviewDecisionSchema.safeParse({
          decision: "approve",
          notes: "Exactly 10",
        }).success,
      ).toBe(true);
    });

    it("rejects notes exceeding 2000 characters", () => {
      expect(
        adminReviewDecisionSchema.safeParse({
          decision: "approve",
          notes: "A".repeat(2001),
        }).success,
      ).toBe(false);
    });

    it("accepts notes at exactly 2000 characters", () => {
      expect(
        adminReviewDecisionSchema.safeParse({
          decision: "approve",
          notes: "A".repeat(2000),
        }).success,
      ).toBe(true);
    });

    it("rejects missing notes", () => {
      expect(
        adminReviewDecisionSchema.safeParse({ decision: "approve" }).success,
      ).toBe(false);
    });

    it("rejects missing decision", () => {
      expect(
        adminReviewDecisionSchema.safeParse({
          notes: "Valid notes content here",
        }).success,
      ).toBe(false);
    });
  });

  describe("trustTierThresholdsSchema", () => {
    it("accepts valid thresholds", () => {
      expect(
        trustTierThresholdsSchema.safeParse({
          autoApprove: 0.7,
          autoFlagMin: 0.4,
          autoRejectMax: 0.4,
        }).success,
      ).toBe(true);
    });

    it("accepts boundary values (all 0)", () => {
      expect(
        trustTierThresholdsSchema.safeParse({
          autoApprove: 0,
          autoFlagMin: 0,
          autoRejectMax: 0,
        }).success,
      ).toBe(true);
    });

    it("accepts boundary values (all 1)", () => {
      expect(
        trustTierThresholdsSchema.safeParse({
          autoApprove: 1,
          autoFlagMin: 1,
          autoRejectMax: 1,
        }).success,
      ).toBe(true);
    });

    it("rejects autoApprove above 1", () => {
      expect(
        trustTierThresholdsSchema.safeParse({
          autoApprove: 1.1,
          autoFlagMin: 0.4,
          autoRejectMax: 0.4,
        }).success,
      ).toBe(false);
    });

    it("rejects negative autoRejectMax", () => {
      expect(
        trustTierThresholdsSchema.safeParse({
          autoApprove: 0.7,
          autoFlagMin: 0.4,
          autoRejectMax: -0.1,
        }).success,
      ).toBe(false);
    });
  });
});
