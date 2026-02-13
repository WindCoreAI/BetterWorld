import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mocks (required for vi.mock factory references)
const {
  mockAdd,
  mockQueueClose,
  mockWorkerOn,
  mockWorkerClose,
  MockWorker,
  MockQueue,
  mockGetDb,
  mockGetFlag,
  mockCalculateRatio,
  mockApplyAdjustment,
  mockCheckCircuitBreaker,
  mockRecordDailyRatio,
} = vi.hoisted(() => {
  const mockAdd = vi.fn().mockResolvedValue({ id: "test-job-id" });
  const mockQueueClose = vi.fn().mockResolvedValue(undefined);
  const mockWorkerOn = vi.fn();
  const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

  let _capturedProcessor: ((...args: unknown[]) => Promise<unknown>) | null = null;

  const MockWorker = vi.fn().mockImplementation(
    (_name: string, processor: (...args: unknown[]) => Promise<unknown>) => {
      _capturedProcessor = processor;
      return { on: mockWorkerOn, close: mockWorkerClose };
    },
  );

  const MockQueue = vi.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockQueueClose,
  }));

  return {
    mockAdd,
    mockQueueClose,
    mockWorkerOn,
    mockWorkerClose,
    MockWorker,
    MockQueue,
    get capturedProcessor() { return _capturedProcessor; },
    set capturedProcessor(v) { _capturedProcessor = v; },
    mockGetDb: vi.fn(),
    mockGetFlag: vi.fn(),
    mockCalculateRatio: vi.fn(),
    mockApplyAdjustment: vi.fn(),
    mockCheckCircuitBreaker: vi.fn(),
    mockRecordDailyRatio: vi.fn(),
  };
});

// We need a local reference to capturedProcessor that updates
// (the hoisted getter/setter handles this)
const hoisted = vi.hoisted(() => {
  let _proc: ((...args: unknown[]) => Promise<unknown>) | null = null;
  return {
    get proc() { return _proc; },
    set proc(v) { _proc = v; },
  };
});

// Mock ioredis
vi.mock("ioredis", () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    zrevrange: vi.fn().mockResolvedValue([]),
    zremrangebyrank: vi.fn().mockResolvedValue(0),
    quit: vi.fn().mockResolvedValue("OK"),
  }));
  return { default: RedisMock };
});

// Mock bullmq — use hoisted references
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(
    (_name: string, processor: (...args: unknown[]) => Promise<unknown>) => {
      hoisted.proc = processor;
      return { on: mockWorkerOn, close: mockWorkerClose };
    },
  ),
  Queue: MockQueue,
}));

// Mock container
vi.mock("../../lib/container.js", () => ({
  initDb: vi.fn(),
  getDb: () => mockGetDb(),
}));

// Mock feature flags
vi.mock("../../services/feature-flags.js", () => ({
  getFlag: (...args: unknown[]) => mockGetFlag(...args),
}));

// Mock rate adjustment service
vi.mock("../../services/rate-adjustment.service.js", () => ({
  calculateFaucetSinkRatio: (...args: unknown[]) => mockCalculateRatio(...args),
  applyRateAdjustment: (...args: unknown[]) => mockApplyAdjustment(...args),
  checkCircuitBreaker: (...args: unknown[]) => mockCheckCircuitBreaker(...args),
  recordDailyRatio: (...args: unknown[]) => mockRecordDailyRatio(...args),
}));

// Import after mocks
import { createRateAdjustmentWorker } from "../rate-adjustment-worker.js";

describe("RateAdjustmentWorker", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.proc = null;

    mockDb = {
      select: vi.fn(),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };

    mockGetDb.mockReturnValue(mockDb);
    mockCalculateRatio.mockResolvedValue(1.0);
    mockCheckCircuitBreaker.mockResolvedValue({ active: false });
    mockRecordDailyRatio.mockResolvedValue(undefined);
    mockApplyAdjustment.mockResolvedValue({
      adjustmentType: "none",
      faucetSinkRatio: 1.0,
      rewardMultiplierBefore: 1.0,
      rewardMultiplierAfter: 1.0,
      costMultiplierBefore: 1.0,
      costMultiplierAfter: 1.0,
      changePercent: 0,
      circuitBreakerActive: false,
    });
  });

  it("should create worker and schedule repeatable job", () => {
    createRateAdjustmentWorker();

    expect(MockQueue).toHaveBeenCalledWith(
      "rate-adjustment",
      expect.any(Object),
    );

    expect(mockAdd).toHaveBeenCalledWith(
      "weekly-adjustment",
      {},
      expect.objectContaining({
        repeat: { pattern: "0 0 * * 0" },
      }),
    );
  });

  it("should skip when DYNAMIC_RATE_ADJUSTMENT_ENABLED is false", async () => {
    mockGetFlag.mockImplementation(async (_redis: unknown, name: string) => {
      if (name === "DYNAMIC_RATE_ADJUSTMENT_ENABLED") return false;
      return undefined;
    });

    createRateAdjustmentWorker();
    expect(hoisted.proc).not.toBeNull();

    const result = await hoisted.proc!();

    expect(result).toEqual({ skipped: true, reason: "disabled" });
    expect(mockCalculateRatio).not.toHaveBeenCalled();
  });

  it("should skip when RATE_ADJUSTMENT_PAUSED is true", async () => {
    mockGetFlag.mockImplementation(async (_redis: unknown, name: string) => {
      if (name === "DYNAMIC_RATE_ADJUSTMENT_ENABLED") return true;
      if (name === "RATE_ADJUSTMENT_PAUSED") return true;
      return undefined;
    });

    createRateAdjustmentWorker();
    expect(hoisted.proc).not.toBeNull();

    const result = await hoisted.proc!();

    expect(result).toEqual({ skipped: true, reason: "paused" });
    expect(mockCalculateRatio).not.toHaveBeenCalled();
  });

  it("should run full cycle when enabled and not paused", async () => {
    mockGetFlag.mockImplementation(async (_redis: unknown, name: string) => {
      if (name === "DYNAMIC_RATE_ADJUSTMENT_ENABLED") return true;
      if (name === "RATE_ADJUSTMENT_PAUSED") return false;
      return undefined;
    });

    mockCalculateRatio.mockResolvedValue(1.0);
    mockCheckCircuitBreaker.mockResolvedValue({ active: false });
    mockApplyAdjustment.mockResolvedValue({
      adjustmentType: "none",
      faucetSinkRatio: 1.0,
      rewardMultiplierBefore: 1.0,
      rewardMultiplierAfter: 1.0,
      costMultiplierBefore: 1.0,
      costMultiplierAfter: 1.0,
      changePercent: 0,
      circuitBreakerActive: false,
    });

    createRateAdjustmentWorker();
    expect(hoisted.proc).not.toBeNull();

    const result = await hoisted.proc!();

    expect(mockCalculateRatio).toHaveBeenCalled();
    expect(mockRecordDailyRatio).toHaveBeenCalled();
    expect(mockCheckCircuitBreaker).toHaveBeenCalled();
    expect(mockApplyAdjustment).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        skipped: false,
        adjustmentType: "none",
      }),
    );
  });

  it("should stop after circuit breaker activates", async () => {
    mockGetFlag.mockImplementation(async (_redis: unknown, name: string) => {
      if (name === "DYNAMIC_RATE_ADJUSTMENT_ENABLED") return true;
      if (name === "RATE_ADJUSTMENT_PAUSED") return false;
      return undefined;
    });

    mockCalculateRatio.mockResolvedValue(3.0);
    mockCheckCircuitBreaker.mockResolvedValue({
      active: true,
      ratio: 3.0,
      consecutiveDays: 3,
    });

    createRateAdjustmentWorker();
    expect(hoisted.proc).not.toBeNull();

    const result = await hoisted.proc!();

    expect(result).toEqual(
      expect.objectContaining({
        skipped: false,
        circuitBreakerActivated: true,
        ratio: 3.0,
        consecutiveDays: 3,
      }),
    );

    // Should NOT have called applyRateAdjustment
    expect(mockApplyAdjustment).not.toHaveBeenCalled();
  });

  it("should throw if database is not initialized", async () => {
    mockGetDb.mockReturnValue(null);
    mockGetFlag.mockImplementation(async (_redis: unknown, name: string) => {
      if (name === "DYNAMIC_RATE_ADJUSTMENT_ENABLED") return true;
      return undefined;
    });

    createRateAdjustmentWorker();
    expect(hoisted.proc).not.toBeNull();

    await expect(hoisted.proc!()).rejects.toThrow("Database not initialized");
  });
});
