/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Agreement Statistics Unit Tests (Sprint 11 — T035)
 *
 * Tests:
 *   1. Overall agreement rate computation
 *   2. By-domain breakdown
 *   3. By-type breakdown
 *   4. Redis caching
 *   5. Pipeline health metrics
 *   6. Latency percentiles
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────

const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };

const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();
const mockRedis = {
  get: mockRedisGet,
  setex: mockRedisSetex,
  options: { host: "localhost", port: 6379 },
} as any;

// Mock BullMQ Queue
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    getJobCounts: vi.fn().mockResolvedValue({ active: 2, waiting: 5, failed: 1 }),
    close: vi.fn(),
  })),
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

describe("Agreement Stats Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAgreementStats", () => {
    it("should return cached data when available", async () => {
      const cachedData = {
        overall: {
          totalSubmissions: 100,
          agreements: 90,
          disagreements: 10,
          agreementRate: 0.9,
          peerApproveLayerBReject: 5,
          peerRejectLayerBApprove: 5,
        },
        byDomain: [],
        bySubmissionType: [],
        period: { from: "2026-01-01", to: "2026-01-31" },
      };

      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cachedData));

      const { getAgreementStats } = await import("../../services/agreement-stats.js");
      const result = await getAgreementStats(mockDb as any, mockRedis, "2026-01-01", "2026-01-31");

      expect(result).toEqual(cachedData);
      expect(mockExecute).not.toHaveBeenCalled(); // DB was not queried
    });

    it("should compute stats from DB when cache is empty", async () => {
      mockRedisGet.mockResolvedValueOnce(null); // no cache

      // Overall stats
      mockExecute.mockResolvedValueOnce([{
        total: "50",
        agreements: "40",
        disagreements: "10",
        peer_approve_lb_reject: "6",
        peer_reject_lb_approve: "4",
      }]);

      // By domain
      mockExecute.mockResolvedValueOnce([
        { domain: "healthcare_improvement", total: "20", agreements: "18" },
        { domain: "clean_energy", total: "15", agreements: "12" },
      ]);

      // By submission type
      mockExecute.mockResolvedValueOnce([
        { submission_type: "problem", total: "30", agreements: "25" },
        { submission_type: "solution", total: "20", agreements: "15" },
      ]);

      const { getAgreementStats } = await import("../../services/agreement-stats.js");
      const result = await getAgreementStats(mockDb as any, mockRedis, "2026-01-01", "2026-01-31");

      expect(result.overall.totalSubmissions).toBe(50);
      expect(result.overall.agreements).toBe(40);
      expect(result.overall.agreementRate).toBe(0.8);
      expect(result.overall.peerApproveLayerBReject).toBe(6);
      expect(result.overall.peerRejectLayerBApprove).toBe(4);

      expect(result.byDomain).toHaveLength(2);
      expect(result.byDomain[0]!.domain).toBe("healthcare_improvement");
      expect(result.byDomain[0]!.agreementRate).toBe(0.9);

      expect(result.bySubmissionType).toHaveLength(2);
      expect(result.bySubmissionType[0]!.submissionType).toBe("problem");

      // Should have cached the result
      expect(mockRedisSetex).toHaveBeenCalledWith(
        expect.stringContaining("betterworld:shadow:agreement"),
        300,
        expect.any(String),
      );
    });

    it("should handle zero submissions gracefully", async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      // Empty results
      mockExecute.mockResolvedValueOnce([{ total: "0", agreements: "0", disagreements: "0", peer_approve_lb_reject: "0", peer_reject_lb_approve: "0" }]);
      mockExecute.mockResolvedValueOnce([]);
      mockExecute.mockResolvedValueOnce([]);

      const { getAgreementStats } = await import("../../services/agreement-stats.js");
      const result = await getAgreementStats(mockDb as any, mockRedis, "2026-01-01", "2026-01-31");

      expect(result.overall.totalSubmissions).toBe(0);
      expect(result.overall.agreementRate).toBe(0);
      expect(result.byDomain).toHaveLength(0);
    });

    it("should work without Redis (null redis)", async () => {
      mockExecute.mockResolvedValueOnce([{ total: "10", agreements: "8", disagreements: "2", peer_approve_lb_reject: "1", peer_reject_lb_approve: "1" }]);
      mockExecute.mockResolvedValueOnce([]);
      mockExecute.mockResolvedValueOnce([]);

      const { getAgreementStats } = await import("../../services/agreement-stats.js");
      const result = await getAgreementStats(mockDb as any, null, "2026-01-01", "2026-01-31");

      expect(result.overall.totalSubmissions).toBe(10);
      expect(result.overall.agreementRate).toBe(0.8);
    });
  });

  describe("getLatencyStats", () => {
    it("should compute latency percentiles correctly", async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      // Consensus latency
      mockExecute.mockResolvedValueOnce([{
        p50: "5000",
        p95: "12000",
        p99: "18000",
        avg_ms: "7000",
        total: "100",
      }]);

      // Validator response time
      mockExecute.mockResolvedValueOnce([{
        p50: "3000",
        p95: "8000",
        p99: "14000",
        avg_ms: "4500",
        total: "200",
      }]);

      // Quorum stats
      mockExecute.mockResolvedValueOnce([{
        total: "100",
        quorum_met: "95",
        quorum_timeout: "5",
      }]);

      const { getLatencyStats } = await import("../../services/agreement-stats.js");
      const result = await getLatencyStats(mockDb as any, mockRedis, "2026-01-01", "2026-01-31");

      expect(result.consensusLatency.p50Ms).toBe(5000);
      expect(result.consensusLatency.p95Ms).toBe(12000);
      expect(result.consensusLatency.p99Ms).toBe(18000);
      expect(result.consensusLatency.avgMs).toBe(7000);
      expect(result.consensusLatency.totalSamples).toBe(100);

      expect(result.validatorResponseTime.totalResponses).toBe(200);

      expect(result.quorumStats.totalAttempts).toBe(100);
      expect(result.quorumStats.quorumMet).toBe(95);
      expect(result.quorumStats.quorumTimeout).toBe(5);
      expect(result.quorumStats.quorumSuccessRate).toBe(0.95);
    });
  });

  describe("getShadowPipelineHealth", () => {
    it("should compute shadow coverage rate", async () => {
      // Coverage result
      mockExecute.mockResolvedValueOnce([{
        guardrail_count: "100",
        consensus_count: "85",
      }]);

      // Quorum formation
      mockExecute.mockResolvedValueOnce([{
        total: "85",
        timeout_count: "5",
      }]);

      const { getShadowPipelineHealth } = await import("../../services/agreement-stats.js");
      const result = await getShadowPipelineHealth(mockDb as any, mockRedis, "2026-01-01", "2026-01-31");

      expect(result.shadowCoverageRate).toBe(0.85);
      expect(result.quorumFormationRate).toBeCloseTo((85 - 5) / 85, 4);
      expect(result.queueActive).toBe(2);
      expect(result.queueWaiting).toBe(5);
      expect(result.queueFailed).toBe(1);
    });

    it("should handle zero guardrail evaluations", async () => {
      mockExecute.mockResolvedValueOnce([{ guardrail_count: "0", consensus_count: "0" }]);
      mockExecute.mockResolvedValueOnce([{ total: "0", timeout_count: "0" }]);

      const { getShadowPipelineHealth } = await import("../../services/agreement-stats.js");
      const result = await getShadowPipelineHealth(mockDb as any, mockRedis, "2026-01-01", "2026-01-31");

      expect(result.shadowCoverageRate).toBe(0);
      expect(result.quorumFormationRate).toBe(1); // Default when no consensus
    });
  });
});
