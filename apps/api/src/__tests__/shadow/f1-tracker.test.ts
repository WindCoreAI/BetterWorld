/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * F1 Score Tracker Unit Tests (Sprint 11 — T028)
 *
 * Tests:
 *   1. Metrics updated correctly after evaluation
 *   2. F1/precision/recall computation
 *   3. Tier promotion: apprentice → journeyman (F1 >= 0.85, 50+ evals)
 *   4. Tier demotion check with min evaluations
 *   5. Division by zero handling
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────

const mockExecute = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOrderBy = vi.fn();

const mockDb = {
  execute: mockExecute,
  update: mockUpdate,
  select: mockSelect,
  insert: mockInsert,
};

mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
mockWhere.mockResolvedValue(undefined);

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit }) });
mockOrderBy.mockReturnValue({ limit: mockLimit });
mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockResolvedValue(undefined);

// Mock ws/feed
vi.mock("../../ws/feed.js", () => ({
  sendToAgent: vi.fn(),
  broadcast: vi.fn(),
}));

// Mock pino
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("F1 Tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateValidatorMetrics", () => {
    it("should skip update when no recent evaluations exist", async () => {
      mockExecute.mockResolvedValueOnce([]); // empty recent evals

      const { updateValidatorMetrics } = await import("../../services/f1-tracker.js");
      await updateValidatorMetrics(
        mockDb as any,
        "validator-1",
        "approved",
        "approved",
      );

      // Should not have called update on validator_pool
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should compute correct metrics for all-correct evaluations", async () => {
      // All evaluations match Layer B — perfect F1
      const recentEvals = Array.from({ length: 10 }, () => ({
        recommendation: "approved",
        layer_b_decision: "approved",
      }));

      mockExecute.mockResolvedValueOnce(recentEvals);

      const { updateValidatorMetrics } = await import("../../services/f1-tracker.js");
      await updateValidatorMetrics(
        mockDb as any,
        "validator-1",
        "approved",
        "approved",
      );

      expect(mockUpdate).toHaveBeenCalled();
      // With all TP: precision=1.0, recall=1.0, F1=1.0
      const setCall = mockSet.mock.calls[0]![0];
      expect(setCall.f1Score).toBe("1.0000");
      expect(setCall.precision).toBe("1.0000");
      expect(setCall.recall).toBe("1.0000");
    });

    it("should compute correct metrics for mixed evaluations", async () => {
      // 5 TP (approved/approved), 2 FP (approved/rejected), 3 FN (rejected/approved)
      const recentEvals = [
        ...Array.from({ length: 5 }, () => ({ recommendation: "approved", layer_b_decision: "approved" })),
        ...Array.from({ length: 2 }, () => ({ recommendation: "approved", layer_b_decision: "rejected" })),
        ...Array.from({ length: 3 }, () => ({ recommendation: "rejected", layer_b_decision: "approved" })),
      ];

      mockExecute.mockResolvedValueOnce(recentEvals);

      const { updateValidatorMetrics } = await import("../../services/f1-tracker.js");
      await updateValidatorMetrics(
        mockDb as any,
        "validator-1",
        "approved",
        "approved",
      );

      expect(mockUpdate).toHaveBeenCalled();
      const setCall = mockSet.mock.calls[0]![0];
      // TP=5, FP=2, FN=3
      // precision = 5/(5+2) = 0.7143
      // recall = 5/(5+3) = 0.6250
      // F1 = 2*0.7143*0.625 / (0.7143+0.625) = 0.6667
      expect(Number(setCall.f1Score)).toBeCloseTo(0.6667, 3);
      expect(Number(setCall.precision)).toBeCloseTo(0.7143, 3);
      expect(Number(setCall.recall)).toBeCloseTo(0.6250, 3);
    });

    it("should treat flagged as rejected for binary classification", async () => {
      // Validator flagged, Layer B rejected → TN (correct)
      const recentEvals = [
        { recommendation: "flagged", layer_b_decision: "rejected" },
        { recommendation: "flagged", layer_b_decision: "flagged" },
        { recommendation: "approved", layer_b_decision: "approved" },
      ];

      mockExecute.mockResolvedValueOnce(recentEvals);

      const { updateValidatorMetrics } = await import("../../services/f1-tracker.js");
      await updateValidatorMetrics(
        mockDb as any,
        "validator-1",
        "flagged",
        "rejected",
      );

      expect(mockUpdate).toHaveBeenCalled();
      const setCall = mockSet.mock.calls[0]![0];
      // TP=1 (approved/approved), TN=2 (flagged+flagged/rejected+flagged)
      // precision = 1/(1+0) = 1.0
      // recall = 1/(1+0) = 1.0
      // F1 = 1.0
      expect(Number(setCall.f1Score)).toBeCloseTo(1.0, 3);
    });
  });

  describe("checkTierChange", () => {
    it("should promote apprentice to journeyman when thresholds met", async () => {
      // Validator: apprentice, F1=0.90, 55 total evals
      mockLimit.mockResolvedValueOnce([{
        id: "v1",
        agentId: "agent-1",
        tier: "apprentice",
        f1Score: "0.9000",
        totalEvaluations: 55,
      }]);

      // No previous tier change
      mockLimit.mockResolvedValueOnce([]);

      // Update tier
      mockWhere.mockResolvedValueOnce(undefined);

      // Insert tier change record
      mockValues.mockResolvedValueOnce(undefined);

      const { checkTierChange } = await import("../../services/f1-tracker.js");
      await checkTierChange(mockDb as any, "v1");

      // Should have inserted a tier change record
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should not promote when evaluation count is insufficient", async () => {
      // Validator: apprentice, F1=0.90, only 30 total evals (need 50)
      mockLimit.mockResolvedValueOnce([{
        id: "v1",
        agentId: "agent-1",
        tier: "apprentice",
        f1Score: "0.9000",
        totalEvaluations: 30,
      }]);

      // No previous tier change
      mockLimit.mockResolvedValueOnce([]);

      const { checkTierChange } = await import("../../services/f1-tracker.js");
      await checkTierChange(mockDb as any, "v1");

      // Should NOT have inserted a tier change record
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should not demote if insufficient evals since last change", async () => {
      // Validator: journeyman, F1=0.80 (below 0.85), 100 total evals
      mockLimit.mockResolvedValueOnce([{
        id: "v1",
        agentId: "agent-1",
        tier: "journeyman",
        f1Score: "0.8000",
        totalEvaluations: 100,
      }]);

      // Last tier change was at 90 total evals → only 10 evals since (need 30)
      mockLimit.mockResolvedValueOnce([{
        totalEvaluationsAtChange: 90,
      }]);

      const { checkTierChange } = await import("../../services/f1-tracker.js");
      await checkTierChange(mockDb as any, "v1");

      // Should NOT have inserted a tier change record (anti-oscillation guard)
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should return early if validator not found", async () => {
      mockLimit.mockResolvedValueOnce([]); // no validator

      const { checkTierChange } = await import("../../services/f1-tracker.js");
      await checkTierChange(mockDb as any, "nonexistent");

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
