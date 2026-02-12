/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Consensus Engine Unit Tests (Sprint 11 — T020)
 *
 * Tests:
 *   1. Unanimous approve → approved
 *   2. Unanimous reject → rejected
 *   3. Mixed votes below thresholds → escalated
 *   4. Safety flag → escalated with reason 'safety_flag'
 *   5. Weighted tier influence (expert vs apprentice)
 *   6. Quorum not met → null
 *   7. Idempotent computation
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────

// We need a more precise mock that tracks call sequence.
// The consensus engine calls tx.execute, then tx.select chains multiple times.

// Mock f1-tracker
vi.mock("../../services/f1-tracker.js", () => ({
  updateValidatorMetrics: vi.fn(),
  checkTierChange: vi.fn(),
}));

// Mock WebSocket feed
vi.mock("../../ws/feed.js", () => ({
  broadcast: vi.fn(),
  sendToAgent: vi.fn(),
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

/**
 * Creates a mock transaction object with chainable select/insert/update methods.
 * Uses a call queue to return different values for sequential calls.
 */
function createMockTx(options: {
  executeResults: unknown[];
  selectChains: Array<{
    hasLimit: boolean;
    result: unknown[];
  }>;
  insertResult?: unknown;
  updateResult?: unknown;
}) {
  let executeCallIdx = 0;
  let selectCallIdx = 0;

  const mockTx: Record<string, unknown> = {
    execute: vi.fn().mockImplementation(() => {
      return Promise.resolve(options.executeResults[executeCallIdx++] ?? []);
    }),
    select: vi.fn().mockImplementation(() => {
      const chainIdx = selectCallIdx++;
      const chain = options.selectChains[chainIdx];
      const result = chain?.result ?? [];

      const fromFn = vi.fn().mockImplementation(() => {
        const whereFn = vi.fn().mockImplementation(() => {
          if (chain?.hasLimit) {
            return {
              limit: vi.fn().mockResolvedValue(result),
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(result),
              }),
            };
          }
          // No limit — return result directly (completedEvals pattern)
          return Promise.resolve(result);
        });
        return { where: whereFn };
      });
      return { from: fromFn };
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(options.insertResult ?? undefined),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue(options.updateResult ?? undefined),
      })),
    })),
  };

  return mockTx;
}

describe("Consensus Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeConsensus", () => {
    it("should return null if consensus already exists (idempotency)", async () => {
      const mockTx = createMockTx({
        executeResults: [[]],  // pg_advisory_xact_lock
        selectChains: [
          { hasLimit: true, result: [{ id: "existing-consensus" }] },  // existing check → found
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-1",
        "problem",
        "approved",
        0.95,
      );

      expect(result).toBeNull();
    });

    it("should return null if quorum not met", async () => {
      const mockTx = createMockTx({
        executeResults: [[]],  // pg_advisory_xact_lock
        selectChains: [
          { hasLimit: true, result: [] },  // no existing consensus
          { hasLimit: false, result: [  // only 2 completed evals
            { id: "e1", recommendation: "approved", confidence: "0.9", safetyFlagged: false, validatorId: "v1", assignedAt: new Date() },
            { id: "e2", recommendation: "approved", confidence: "0.8", safetyFlagged: false, validatorId: "v2", assignedAt: new Date() },
          ]},
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-2",
        "problem",
        "approved",
        0.9,
      );

      expect(result).toBeNull();
    });

    it("should escalate immediately when safety flag is present", async () => {
      const assignedAt = new Date(Date.now() - 60000);

      const mockTx = createMockTx({
        executeResults: [[]],  // pg_advisory_xact_lock
        selectChains: [
          { hasLimit: true, result: [] },  // no existing consensus
          { hasLimit: false, result: [  // 3 evals, one safety flagged
            { id: "e1", recommendation: "approved", confidence: "0.9", safetyFlagged: true, validatorId: "v1", assignedAt },
            { id: "e2", recommendation: "approved", confidence: "0.8", safetyFlagged: false, validatorId: "v2", assignedAt },
            { id: "e3", recommendation: "approved", confidence: "0.85", safetyFlagged: false, validatorId: "v3", assignedAt },
          ]},
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-3",
        "problem",
        "approved",
        0.9,
      );

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("escalated");
      expect(result!.escalationReason).toBe("safety_flag");
    });

    it("should compute unanimous approve correctly", async () => {
      const assignedAt = new Date(Date.now() - 60000);

      const mockTx = createMockTx({
        executeResults: [[]],
        selectChains: [
          { hasLimit: true, result: [] },  // no existing
          { hasLimit: false, result: [  // 3 approved evals
            { id: "e1", recommendation: "approved", confidence: "0.9", safetyFlagged: false, validatorId: "v1", assignedAt },
            { id: "e2", recommendation: "approved", confidence: "0.85", safetyFlagged: false, validatorId: "v2", assignedAt },
            { id: "e3", recommendation: "approved", confidence: "0.8", safetyFlagged: false, validatorId: "v3", assignedAt },
          ]},
          // Validator tier lookups (3 calls)
          { hasLimit: true, result: [{ tier: "apprentice" }] },
          { hasLimit: true, result: [{ tier: "apprentice" }] },
          { hasLimit: true, result: [{ tier: "apprentice" }] },
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-4",
        "problem",
        "approved",
        0.9,
      );

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("approved");
      expect(result!.weightedApprove).toBeGreaterThan(0);
      expect(result!.weightedReject).toBe(0);
    });

    it("should compute unanimous reject correctly", async () => {
      const assignedAt = new Date(Date.now() - 60000);

      const mockTx = createMockTx({
        executeResults: [[]],
        selectChains: [
          { hasLimit: true, result: [] },
          { hasLimit: false, result: [
            { id: "e1", recommendation: "rejected", confidence: "0.9", safetyFlagged: false, validatorId: "v1", assignedAt },
            { id: "e2", recommendation: "rejected", confidence: "0.85", safetyFlagged: false, validatorId: "v2", assignedAt },
            { id: "e3", recommendation: "rejected", confidence: "0.8", safetyFlagged: false, validatorId: "v3", assignedAt },
          ]},
          { hasLimit: true, result: [{ tier: "apprentice" }] },
          { hasLimit: true, result: [{ tier: "apprentice" }] },
          { hasLimit: true, result: [{ tier: "apprentice" }] },
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-5",
        "problem",
        "rejected",
        0.3,
      );

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("rejected");
      expect(result!.weightedReject).toBeGreaterThan(0);
      expect(result!.weightedApprove).toBe(0);
    });

    it("should escalate when votes are mixed below thresholds", async () => {
      const assignedAt = new Date(Date.now() - 60000);

      const mockTx = createMockTx({
        executeResults: [[]],
        selectChains: [
          { hasLimit: true, result: [] },
          { hasLimit: false, result: [
            { id: "e1", recommendation: "approved", confidence: "0.9", safetyFlagged: false, validatorId: "v1", assignedAt },
            { id: "e2", recommendation: "rejected", confidence: "0.9", safetyFlagged: false, validatorId: "v2", assignedAt },
            { id: "e3", recommendation: "flagged", confidence: "0.9", safetyFlagged: false, validatorId: "v3", assignedAt },
          ]},
          { hasLimit: true, result: [{ tier: "apprentice" }] },
          { hasLimit: true, result: [{ tier: "apprentice" }] },
          { hasLimit: true, result: [{ tier: "apprentice" }] },
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-6",
        "problem",
        "approved",
        0.7,
      );

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("escalated");
    });

    it("should apply tier weights: expert outweighs apprentice", async () => {
      const assignedAt = new Date(Date.now() - 60000);

      const mockTx = createMockTx({
        executeResults: [[]],
        selectChains: [
          { hasLimit: true, result: [] },
          { hasLimit: false, result: [
            { id: "e1", recommendation: "approved", confidence: "0.9", safetyFlagged: false, validatorId: "v1", assignedAt },
            { id: "e2", recommendation: "rejected", confidence: "0.9", safetyFlagged: false, validatorId: "v2", assignedAt },
            { id: "e3", recommendation: "rejected", confidence: "0.9", safetyFlagged: false, validatorId: "v3", assignedAt },
          ]},
          { hasLimit: true, result: [{ tier: "expert" }] },     // v1 expert
          { hasLimit: true, result: [{ tier: "apprentice" }] },  // v2
          { hasLimit: true, result: [{ tier: "apprentice" }] },  // v3
        ],
      });

      const mockDb = {
        transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      };

      const { computeConsensus } = await import("../../services/consensus-engine.js");
      const result = await computeConsensus(
        mockDb as any,
        "sub-7",
        "problem",
        "approved",
        0.8,
      );

      expect(result).not.toBeNull();
      // Expert approve: 2.0 * 0.9 = 1.8
      // Apprentice reject: 1.0 * 0.9 * 2 = 1.8
      // Neither reaches 0.67 threshold → escalated
      expect(result!.decision).toBe("escalated");
      expect(result!.weightedApprove).toBeCloseTo(1.8, 1);
      expect(result!.weightedReject).toBeCloseTo(1.8, 1);
    });
  });
});
