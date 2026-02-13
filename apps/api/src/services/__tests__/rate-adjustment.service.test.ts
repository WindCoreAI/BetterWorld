import {
  RATE_ADJUSTMENT_STEP,
  FAUCET_SINK_UPPER,
  FAUCET_SINK_LOWER,
  CIRCUIT_BREAKER_RATIO,
  CIRCUIT_BREAKER_DAYS,
} from "@betterworld/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mocks (required for vi.mock factory references)
const { mockGetFlag, mockSetFlag } = vi.hoisted(() => ({
  mockGetFlag: vi.fn(),
  mockSetFlag: vi.fn(),
}));

vi.mock("../feature-flags.js", () => ({
  getFlag: (...args: unknown[]) => mockGetFlag(...args),
  setFlag: (...args: unknown[]) => mockSetFlag(...args),
}));

// Mock logger
vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  calculateFaucetSinkRatio,
  applyRateAdjustment,
  checkCircuitBreaker,
  recordDailyRatio,
} from "../rate-adjustment.service.js";

describe("RateAdjustmentService", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };

    mockRedis = {
      zadd: vi.fn().mockResolvedValue(1),
      zrevrange: vi.fn().mockResolvedValue([]),
      zremrangebyrank: vi.fn().mockResolvedValue(0),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
    };

    // Default flag values
    mockGetFlag.mockImplementation(
      async (_redis: unknown, name: string) => {
        switch (name) {
          case "VALIDATION_REWARD_MULTIPLIER":
            return 1.0;
          case "SUBMISSION_COST_MULTIPLIER":
            return 1.0;
          case "RATE_ADJUSTMENT_PAUSED":
            return false;
          case "DYNAMIC_RATE_ADJUSTMENT_ENABLED":
            return true;
          default:
            return undefined;
        }
      },
    );
    mockSetFlag.mockResolvedValue({ previousValue: undefined });
  });

  // ========================================================================
  // calculateFaucetSinkRatio
  // ========================================================================

  describe("calculateFaucetSinkRatio", () => {
    it("should return correct ratio for normal transactions", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { faucetTotal: "1000", sinkTotal: "800" },
          ]),
        }),
      });

      const ratio = await calculateFaucetSinkRatio(
        mockDb as unknown as PostgresJsDatabase,
      );

      expect(ratio).toBe(1.25);
    });

    it("should return 1.0 when no transactions exist", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { faucetTotal: "0", sinkTotal: "0" },
          ]),
        }),
      });

      const ratio = await calculateFaucetSinkRatio(
        mockDb as unknown as PostgresJsDatabase,
      );

      expect(ratio).toBe(1.0);
    });

    it("should return Infinity when sink is zero but faucet is positive", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { faucetTotal: "500", sinkTotal: "0" },
          ]),
        }),
      });

      const ratio = await calculateFaucetSinkRatio(
        mockDb as unknown as PostgresJsDatabase,
      );

      expect(ratio).toBe(Infinity);
    });

    it("should accept custom period days", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { faucetTotal: "200", sinkTotal: "100" },
          ]),
        }),
      });

      const ratio = await calculateFaucetSinkRatio(
        mockDb as unknown as PostgresJsDatabase,
        14,
      );

      expect(ratio).toBe(2.0);
    });
  });

  // ========================================================================
  // applyRateAdjustment
  // ========================================================================

  describe("applyRateAdjustment", () => {
    it("should decrease rewards and increase costs when ratio is high", async () => {
      const highRatio = FAUCET_SINK_UPPER + 0.1; // 1.25

      const result = await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        highRatio,
      );

      expect(result.adjustmentType).toBe("decrease");
      expect(result.rewardMultiplierAfter).toBeLessThan(result.rewardMultiplierBefore);
      expect(result.costMultiplierAfter).toBeGreaterThan(result.costMultiplierBefore);

      // Verify setFlag was called with decreased reward and increased cost
      expect(mockSetFlag).toHaveBeenCalledWith(
        mockRedis,
        "VALIDATION_REWARD_MULTIPLIER",
        expect.any(Number),
      );
      expect(mockSetFlag).toHaveBeenCalledWith(
        mockRedis,
        "SUBMISSION_COST_MULTIPLIER",
        expect.any(Number),
      );

      // Verify the adjustment step was applied
      const expectedReward = Number((1.0 * (1 - RATE_ADJUSTMENT_STEP)).toFixed(4));
      const expectedCost = Number((1.0 * (1 + RATE_ADJUSTMENT_STEP)).toFixed(4));
      expect(result.rewardMultiplierAfter).toBe(expectedReward);
      expect(result.costMultiplierAfter).toBe(expectedCost);
    });

    it("should increase rewards and decrease costs when ratio is low", async () => {
      const lowRatio = FAUCET_SINK_LOWER - 0.1; // 0.75

      const result = await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        lowRatio,
      );

      expect(result.adjustmentType).toBe("increase");
      expect(result.rewardMultiplierAfter).toBeGreaterThan(result.rewardMultiplierBefore);
      expect(result.costMultiplierAfter).toBeLessThan(result.costMultiplierBefore);

      const expectedReward = Number((1.0 * (1 + RATE_ADJUSTMENT_STEP)).toFixed(4));
      const expectedCost = Number((1.0 * (1 - RATE_ADJUSTMENT_STEP)).toFixed(4));
      expect(result.rewardMultiplierAfter).toBe(expectedReward);
      expect(result.costMultiplierAfter).toBe(expectedCost);
    });

    it("should make no change when ratio is in healthy range", async () => {
      const healthyRatio = 1.0; // between FAUCET_SINK_LOWER and FAUCET_SINK_UPPER

      const result = await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        healthyRatio,
      );

      expect(result.adjustmentType).toBe("none");
      expect(result.rewardMultiplierAfter).toBe(result.rewardMultiplierBefore);
      expect(result.costMultiplierAfter).toBe(result.costMultiplierBefore);
      expect(result.changePercent).toBe(0);

      // setFlag should NOT have been called (no multiplier change)
      expect(mockSetFlag).not.toHaveBeenCalled();
    });

    it("should cap adjustment at RATE_ADJUSTMENT_CAP", async () => {
      // RATE_ADJUSTMENT_STEP is 0.10 and RATE_ADJUSTMENT_CAP is 0.20
      // Since step <= cap, the step value (10%) should be used
      const highRatio = 2.0;

      const result = await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        highRatio,
      );

      expect(result.changePercent).toBe(RATE_ADJUSTMENT_STEP * 100); // 10%
    });

    it("should clamp multipliers to valid range [0.01, 5.0]", async () => {
      // Set current reward very low so decrease would push below 0.01
      mockGetFlag.mockImplementation(
        async (_redis: unknown, name: string) => {
          if (name === "VALIDATION_REWARD_MULTIPLIER") return 0.02;
          if (name === "SUBMISSION_COST_MULTIPLIER") return 4.9;
          return undefined;
        },
      );

      const highRatio = FAUCET_SINK_UPPER + 0.5;

      const result = await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        highRatio,
      );

      expect(result.rewardMultiplierAfter).toBeGreaterThanOrEqual(0.01);
      expect(result.costMultiplierAfter).toBeLessThanOrEqual(5.0);
    });

    it("should insert an audit row for the adjustment", async () => {
      await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        1.5,
      );

      expect(mockDb.insert).toHaveBeenCalled();
      const insertCall = mockDb.insert.mock.results[0]!.value;
      expect(insertCall.values).toHaveBeenCalled();
    });

    it("should handle Infinity ratio gracefully", async () => {
      const result = await applyRateAdjustment(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
        Infinity,
      );

      // Infinity > FAUCET_SINK_UPPER, so should decrease
      expect(result.adjustmentType).toBe("decrease");
      expect(result.faucetSinkRatio).toBe(999.99);
    });
  });

  // ========================================================================
  // checkCircuitBreaker
  // ========================================================================

  describe("checkCircuitBreaker", () => {
    it("should trigger after consecutive days above threshold", async () => {
      // Mock Redis sorted set with entries above CIRCUIT_BREAKER_RATIO for CIRCUIT_BREAKER_DAYS
      const entries: string[] = [];
      for (let i = 0; i < CIRCUIT_BREAKER_DAYS; i++) {
        entries.push(String(CIRCUIT_BREAKER_RATIO + 0.5)); // value
        entries.push(String(Date.now() - i * 86400000)); // score (timestamp)
      }
      mockRedis.zrevrange.mockResolvedValue(entries);

      const result = await checkCircuitBreaker(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
      );

      expect(result.active).toBe(true);
      expect(result.consecutiveDays).toBe(CIRCUIT_BREAKER_DAYS);
      expect(result.ratio).toBe(CIRCUIT_BREAKER_RATIO + 0.5);

      // Should have paused rate adjustments
      expect(mockSetFlag).toHaveBeenCalledWith(
        mockRedis,
        "RATE_ADJUSTMENT_PAUSED",
        true,
      );
    });

    it("should not trigger when ratios are below threshold", async () => {
      const entries: string[] = [];
      for (let i = 0; i < CIRCUIT_BREAKER_DAYS; i++) {
        entries.push(String(CIRCUIT_BREAKER_RATIO - 0.5)); // Below threshold
        entries.push(String(Date.now() - i * 86400000));
      }
      mockRedis.zrevrange.mockResolvedValue(entries);

      const result = await checkCircuitBreaker(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
      );

      expect(result.active).toBe(false);
      expect(mockSetFlag).not.toHaveBeenCalled();
    });

    it("should not trigger when not enough consecutive days", async () => {
      // Only 2 entries, but CIRCUIT_BREAKER_DAYS is 3
      const entries: string[] = [];
      for (let i = 0; i < CIRCUIT_BREAKER_DAYS - 1; i++) {
        entries.push(String(CIRCUIT_BREAKER_RATIO + 1.0));
        entries.push(String(Date.now() - i * 86400000));
      }
      mockRedis.zrevrange.mockResolvedValue(entries);

      const result = await checkCircuitBreaker(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
      );

      expect(result.active).toBe(false);
    });

    it("should not trigger when one day is below threshold", async () => {
      // 3 days but one is below threshold
      const entries = [
        String(CIRCUIT_BREAKER_RATIO + 0.5), String(Date.now()),
        String(CIRCUIT_BREAKER_RATIO - 0.1), String(Date.now() - 86400000), // Below
        String(CIRCUIT_BREAKER_RATIO + 1.0), String(Date.now() - 172800000),
      ];
      mockRedis.zrevrange.mockResolvedValue(entries);

      const result = await checkCircuitBreaker(
        mockDb as unknown as PostgresJsDatabase,
        mockRedis as unknown as Redis,
      );

      expect(result.active).toBe(false);
    });
  });

  // ========================================================================
  // recordDailyRatio
  // ========================================================================

  describe("recordDailyRatio", () => {
    it("should add ratio to sorted set and trim", async () => {
      await recordDailyRatio(mockRedis as unknown as Redis, 1.5);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        "circuit:ratio:daily",
        expect.any(Number),
        "1.5",
      );
      expect(mockRedis.zremrangebyrank).toHaveBeenCalledWith(
        "circuit:ratio:daily",
        0,
        -31, // -(30 + 1)
      );
    });

    it("should handle Infinity ratio by capping at 999.99", async () => {
      await recordDailyRatio(mockRedis as unknown as Redis, Infinity);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        "circuit:ratio:daily",
        expect.any(Number),
        "999.99",
      );
    });
  });
});
