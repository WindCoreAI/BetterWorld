import { describe, it, expect, vi, beforeEach } from "vitest";

import { assignHybridQuorum } from "../hybrid-quorum.service.js";

// ── Mock logger ──────────────────────────────────────────────
vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock DB helpers ──────────────────────────────────────────

function makeValidator(id: string, agentId: string, tier: string, homeRegionPoint: string | null = null) {
  return { id, agentId, tier, homeRegionPoint };
}

const LOCAL_VALIDATOR_1 = makeValidator("val-local-1", "agent-local-1", "journeyman", "POINT(-87.6 41.8)");
const LOCAL_VALIDATOR_2 = makeValidator("val-local-2", "agent-local-2", "apprentice", "POINT(-87.7 41.9)");
const LOCAL_VALIDATOR_3 = makeValidator("val-local-3", "agent-local-3", "expert", "POINT(-87.5 41.7)");
const GLOBAL_VALIDATOR_1 = makeValidator("val-global-1", "agent-global-1", "journeyman", null);
const GLOBAL_VALIDATOR_2 = makeValidator("val-global-2", "agent-global-2", "apprentice", null);
const GLOBAL_VALIDATOR_3 = makeValidator("val-global-3", "agent-global-3", "expert", null);
const GLOBAL_VALIDATOR_4 = makeValidator("val-global-4", "agent-global-4", "journeyman", null);

describe("Hybrid Quorum Service", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Build fresh mock chains for each test
    mockDb = createMockDb();
  });

  function createMockDb() {
    const selectLimitFn = vi.fn();
    const selectWhereFn = vi.fn().mockReturnValue({ limit: selectLimitFn });
    const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn, limit: selectLimitFn });
    const selectFn = vi.fn().mockReturnValue({ from: selectFromFn });

    return {
      select: selectFn,
      _selectFrom: selectFromFn,
      _selectWhere: selectWhereFn,
      _selectLimit: selectLimitFn,
    };
  }

  describe("global scope", () => {
    it("assigns 3 global validators for global scope", async () => {
      // First call: peerEvaluations (existing) -> empty
      const selectCall1 = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Second call: validatorPool candidates
      const selectCall2 = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              GLOBAL_VALIDATOR_1,
              GLOBAL_VALIDATOR_2,
              GLOBAL_VALIDATOR_3,
              GLOBAL_VALIDATOR_4,
            ]),
          }),
        }),
      });

      mockDb.select = vi.fn()
        .mockReturnValueOnce(selectCall1())
        .mockReturnValueOnce(selectCall2());

      const result = await assignHybridQuorum(
        mockDb,
        "submission-1",
        null,
        "global",
      );

      expect(result.composition).toBe("global_only");
      expect(result.localValidators).toHaveLength(0);
      expect(result.globalValidators.length).toBeLessThanOrEqual(3);
    });
  });

  describe("hyperlocal scope — 2 local + 1 global", () => {
    it("assigns hybrid quorum with local + global validators", async () => {
      // First call: existing peer evaluations (empty)
      const existingEvalsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Second call: local candidates (PostGIS ST_DWithin)
      const localResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              LOCAL_VALIDATOR_1,
              LOCAL_VALIDATOR_2,
              LOCAL_VALIDATOR_3,
            ]),
          }),
        }),
      });

      // Third call: global candidates (excluding local IDs)
      const globalResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              GLOBAL_VALIDATOR_1,
              GLOBAL_VALIDATOR_2,
            ]),
          }),
        }),
      });

      mockDb.select = vi.fn()
        .mockReturnValueOnce(existingEvalsResult())
        .mockReturnValueOnce(localResult())
        .mockReturnValueOnce(globalResult());

      const result = await assignHybridQuorum(
        mockDb,
        "submission-2",
        { lat: 41.8781, lng: -87.6298 },
        "city",
      );

      expect(result.composition).toBe("hybrid");
      expect(result.localValidators.length).toBeLessThanOrEqual(2);
      expect(result.globalValidators.length).toBeLessThanOrEqual(1);
      // Total quorum should be 3
      expect(result.localValidators.length + result.globalValidators.length).toBeLessThanOrEqual(3);
    });
  });

  describe("graceful degradation", () => {
    it("falls back to global-only when fewer than 2 local validators", async () => {
      // First call: existing peer evaluations (empty)
      const existingEvalsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Second call: only 1 local candidate (below LOCAL_QUORUM_SIZE)
      const localResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([LOCAL_VALIDATOR_1]),
          }),
        }),
      });

      // Third call: fallback global candidates
      const globalResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              GLOBAL_VALIDATOR_1,
              GLOBAL_VALIDATOR_2,
              GLOBAL_VALIDATOR_3,
            ]),
          }),
        }),
      });

      mockDb.select = vi.fn()
        .mockReturnValueOnce(existingEvalsResult())
        .mockReturnValueOnce(localResult())
        .mockReturnValueOnce(globalResult());

      const result = await assignHybridQuorum(
        mockDb,
        "submission-3",
        { lat: 41.8781, lng: -87.6298 },
        "neighborhood",
      );

      expect(result.composition).toBe("global_only");
      expect(result.localValidators).toHaveLength(0);
      expect(result.globalValidators.length).toBeLessThanOrEqual(3);
    });
  });

  describe("author exclusion", () => {
    it("excludes validators already assigned to the submission", async () => {
      // First call: existing peer evaluations (with already-assigned validators)
      const existingEvalsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { validatorId: "val-global-1" },
          ]),
        }),
      });

      // Second call: candidates (val-global-1 should be excluded)
      const candidatesResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              GLOBAL_VALIDATOR_2,
              GLOBAL_VALIDATOR_3,
              GLOBAL_VALIDATOR_4,
            ]),
          }),
        }),
      });

      mockDb.select = vi.fn()
        .mockReturnValueOnce(existingEvalsResult())
        .mockReturnValueOnce(candidatesResult());

      const result = await assignHybridQuorum(
        mockDb,
        "submission-4",
        null,
        "global",
      );

      expect(result.composition).toBe("global_only");
      // val-global-1 should NOT appear in the results
      expect(result.globalValidators).not.toContain("val-global-1");
    });
  });
});
