import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock fns are available when vi.mock factory runs
const { mockGet, mockIncrby, mockTtl, mockExpire } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockIncrby: vi.fn(),
  mockTtl: vi.fn(),
  mockExpire: vi.fn(),
}));

// Mock pino logger to spy on alerts - must be hoisted
const { mockLoggerError, mockLoggerWarn, mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

// Mock container to return mocked Redis
vi.mock("../lib/container.js", () => ({
  getRedis: vi.fn(() => ({
    get: mockGet,
    incrby: mockIncrby,
    ttl: mockTtl,
    expire: mockExpire,
  })),
}));

vi.mock("pino", () => ({
  default: vi.fn(() => ({
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  })),
}));

import { checkBudgetAvailable, recordAiCost, getDailyUsage } from "../lib/budget.js";
import { getRedis } from "../lib/container.js";

describe("AI Budget Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables to defaults
    delete process.env.AI_DAILY_BUDGET_CAP_CENTS;
    delete process.env.AI_BUDGET_ALERT_THRESHOLD_PCT;
  });

  describe("checkBudgetAvailable", () => {
    it("should return true when current usage is under cap", async () => {
      mockGet.mockResolvedValue("500"); // 500 cents used
      // Default cap is 1333 cents

      const result = await checkBudgetAvailable();

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledOnce();
    });

    it("should return false when current usage equals cap", async () => {
      mockGet.mockResolvedValue("1333"); // At cap

      const result = await checkBudgetAvailable();

      expect(result).toBe(false);
    });

    it("should return false when current usage exceeds cap", async () => {
      mockGet.mockResolvedValue("1500"); // Over cap

      const result = await checkBudgetAvailable();

      expect(result).toBe(false);
    });

    it("should return true when Redis returns null (no usage yet)", async () => {
      mockGet.mockResolvedValue(null);

      const result = await checkBudgetAvailable();

      expect(result).toBe(true);
    });

    it("should return true when Redis is unavailable (fail open)", async () => {
      // Mock getRedis to return null
      vi.mocked(getRedis).mockReturnValueOnce(null);

      const result = await checkBudgetAvailable();

      expect(result).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should respect custom budget cap from environment", async () => {
      process.env.AI_DAILY_BUDGET_CAP_CENTS = "2000";
      mockGet.mockResolvedValue("1900"); // Under custom cap

      const result = await checkBudgetAvailable();

      expect(result).toBe(true);
    });
  });

  describe("recordAiCost", () => {
    it("should increment Redis counter and return correct percentUsed", async () => {
      mockIncrby.mockResolvedValue(100); // New total: 100 cents
      mockTtl.mockResolvedValue(-1); // Key has no TTL (new key)
      mockExpire.mockResolvedValue(1);

      const result = await recordAiCost(100);

      expect(result.total).toBe(100);
      expect(result.percentUsed).toBeCloseTo(7.5, 1); // 100/1333 * 100 ≈ 7.5%
      expect(mockIncrby).toHaveBeenCalledTimes(2); // Daily + hourly
      expect(mockExpire).toHaveBeenCalledTimes(2); // Set TTL on both keys
    });

    it("should not set TTL if key already has one", async () => {
      mockIncrby.mockResolvedValue(200);
      mockTtl.mockResolvedValue(3600); // Key already has TTL

      await recordAiCost(100);

      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("should trigger error log at 100% threshold", async () => {
      mockIncrby.mockResolvedValue(1333); // At cap
      mockTtl.mockResolvedValue(3600);

      await recordAiCost(100);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: "budget",
          percentUsed: 100,
          dailyCapCents: 1333,
          totalCents: 1333,
        }),
        expect.stringContaining("BUDGET CAP REACHED"),
      );
    });

    it("should trigger error log above 100% threshold", async () => {
      mockIncrby.mockResolvedValue(1500); // Over cap
      mockTtl.mockResolvedValue(3600);

      await recordAiCost(200);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: "budget",
          percentUsed: 113,
          dailyCapCents: 1333,
          totalCents: 1500,
        }),
        expect.stringContaining("BUDGET CAP REACHED"),
      );
    });

    it("should trigger warn log at 80% threshold", async () => {
      mockIncrby.mockResolvedValue(1067); // 80.04% of 1333, rounds to 80%
      mockTtl.mockResolvedValue(3600);

      await recordAiCost(100);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: "budget",
          percentUsed: 80,
          dailyCapCents: 1333,
        }),
        expect.stringContaining("Budget alert threshold reached"),
      );
    });

    it("should trigger info log at 50% threshold", async () => {
      mockIncrby.mockResolvedValue(667); // 50.04% of 1333, rounds to 50%
      mockTtl.mockResolvedValue(3600);

      await recordAiCost(100);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: "budget",
          percentUsed: 50,
          dailyCapCents: 1333,
        }),
        expect.stringContaining("Budget 50% usage"),
      );
    });

    it("should not trigger alerts below 50%", async () => {
      mockIncrby.mockResolvedValue(500); // ~37% of 1333
      mockTtl.mockResolvedValue(3600);

      await recordAiCost(100);

      expect(mockLoggerError).not.toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled();
      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it("should respect custom alert threshold from environment", async () => {
      process.env.AI_BUDGET_ALERT_THRESHOLD_PCT = "90";
      mockIncrby.mockResolvedValue(1200); // 90% of 1333
      mockTtl.mockResolvedValue(3600);

      await recordAiCost(100);

      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it("should return safe defaults when Redis is null", async () => {
      vi.mocked(getRedis).mockReturnValueOnce(null);

      const result = await recordAiCost(100);

      expect(result.total).toBe(0);
      expect(result.percentUsed).toBe(0);
      expect(mockIncrby).not.toHaveBeenCalled();
    });

    it("should increment both daily and hourly keys", async () => {
      mockIncrby.mockResolvedValue(100);
      mockTtl.mockResolvedValue(-1);
      mockExpire.mockResolvedValue(1);

      await recordAiCost(50);

      // Should be called twice: once for daily, once for hourly
      expect(mockIncrby).toHaveBeenCalledTimes(2);
      const calls = mockIncrby.mock.calls;
      expect(calls[0]?.[0]).toMatch(/^ai_cost:daily:/);
      expect(calls[0]?.[1]).toBe(50);
      expect(calls[1]?.[0]).toMatch(/^ai_cost:hourly:/);
      expect(calls[1]?.[1]).toBe(50);
    });

    it("should set correct TTL for daily and hourly keys", async () => {
      mockIncrby.mockResolvedValue(100);
      mockTtl.mockResolvedValue(-1);
      mockExpire.mockResolvedValue(1);

      await recordAiCost(100);

      expect(mockExpire).toHaveBeenCalledTimes(2);
      const calls = mockExpire.mock.calls;
      // Daily key: 48 hours
      expect(calls[0]?.[1]).toBe(48 * 60 * 60);
      // Hourly key: 25 hours
      expect(calls[1]?.[1]).toBe(25 * 60 * 60);
    });
  });

  describe("getDailyUsage", () => {
    it("should return correct usage and percentUsed", async () => {
      mockGet.mockResolvedValue("666"); // 50% of 1333

      const result = await getDailyUsage();

      expect(result.totalCents).toBe(666);
      expect(result.capCents).toBe(1333);
      expect(result.percentUsed).toBeCloseTo(50, 1);
    });

    it("should return zero usage when Redis returns null", async () => {
      mockGet.mockResolvedValue(null);

      const result = await getDailyUsage();

      expect(result.totalCents).toBe(0);
      expect(result.capCents).toBe(1333);
      expect(result.percentUsed).toBe(0);
    });

    it("should return safe defaults when Redis is null", async () => {
      vi.mocked(getRedis).mockReturnValueOnce(null);

      const result = await getDailyUsage();

      expect(result.totalCents).toBe(0);
      expect(result.capCents).toBe(1333);
      expect(result.percentUsed).toBe(0);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should respect custom budget cap from environment", async () => {
      process.env.AI_DAILY_BUDGET_CAP_CENTS = "2000";
      mockGet.mockResolvedValue("1000");

      const result = await getDailyUsage();

      expect(result.capCents).toBe(2000);
      expect(result.percentUsed).toBe(50);
    });

    it("should handle usage at exactly 100%", async () => {
      mockGet.mockResolvedValue("1333");

      const result = await getDailyUsage();

      expect(result.percentUsed).toBe(100);
    });

    it("should handle usage over 100%", async () => {
      mockGet.mockResolvedValue("1500");

      const result = await getDailyUsage();

      expect(result.percentUsed).toBeCloseTo(112.5, 1);
    });
  });
});
