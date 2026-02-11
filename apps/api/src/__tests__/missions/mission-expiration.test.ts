/**
 * Mission Expiration Worker Integration Tests (Sprint 8 — T047)
 *
 * 5 tests covering: expired unclaimed mission, grace period skip,
 * abandoned claims expiration, batch processing, idempotency.
 *
 * Mocks getDb() and tests processMissionExpiration() directly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock infrastructure ────────────────────────────────────────────

// DB chainable mocks
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbExecute = vi.fn();

// Transaction mocks
const mockTxUpdate = vi.fn();
const mockTxExecute = vi.fn();

const mockTransaction = vi.fn(
  async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ update: mockTxUpdate, execute: mockTxExecute }),
);

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    update: mockDbUpdate,
    execute: mockDbExecute,
    transaction: mockTransaction,
  })),
  getRedis: vi.fn(() => null),
  initDb: vi.fn(),
}));

// Mock pino logger to suppress noise
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────

const MOCK_MISSION_ID_1 = "aaaaaaaa-1111-2222-3333-444444444444";
const MOCK_MISSION_ID_2 = "bbbbbbbb-1111-2222-3333-444444444444";
const MOCK_MISSION_ID_3 = "cccccccc-1111-2222-3333-444444444444";
const MOCK_CLAIM_ID_1 = "dddddddd-1111-2222-3333-444444444444";

/** Build a select chain that returns the given rows (for missions query — has .limit()). */
function buildSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

/** Build a claims select chain — no .limit() in the batch claims query. */
function buildClaimsSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

/** Build an update chain for tx.update().set().where(). */
function buildTxUpdateChain() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  return { set: setFn, _where: whereFn, _set: setFn };
}

function resetMocks() {
  mockDbSelect.mockReset();
  mockDbUpdate.mockReset();
  mockDbExecute.mockReset();
  mockTxUpdate.mockReset();
  mockTxExecute.mockReset();
  mockTransaction.mockReset();

  // Re-establish transaction mock
  mockTransaction.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ update: mockTxUpdate, execute: mockTxExecute }),
  );
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Mission Expiration Worker — processMissionExpiration()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("should expire an unclaimed mission past its expiresAt", async () => {
    // Select 1: expired missions query — returns 1 mission
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([
        { id: MOCK_MISSION_ID_1, currentClaimCount: 0 },
      ]),
    );

    // Select 2: batch claims for expired missions — none
    mockDbSelect.mockReturnValueOnce(
      buildClaimsSelectChain([]),
    );

    // Select 3: next batch — empty (no more missions)
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([]),
    );

    // Transaction: update mission status + execute release claims
    const txUpdateChain = buildTxUpdateChain();
    mockTxUpdate.mockReturnValueOnce(txUpdateChain);
    mockTxExecute.mockResolvedValueOnce([]); // No claims released

    const { processMissionExpiration } = await import(
      "../../workers/mission-expiration.js"
    );

    const result = await processMissionExpiration();

    expect(result.processedCount).toBe(1);
    expect(result.expiredCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.releasedClaimsCount).toBe(0);

    // Verify mission was updated in transaction
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockTxUpdate).toHaveBeenCalled();
  });

  it("should skip a mission with active claims still within deadline (grace period)", async () => {
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    // Select 1: expired missions query — returns 1 mission
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([
        { id: MOCK_MISSION_ID_1, currentClaimCount: 1 },
      ]),
    );

    // Select 2: batch claims — one with future deadline (includes missionId)
    mockDbSelect.mockReturnValueOnce(
      buildClaimsSelectChain([
        { id: MOCK_CLAIM_ID_1, missionId: MOCK_MISSION_ID_1, deadlineAt: futureDeadline },
      ]),
    );

    // Select 3: next batch — empty
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([]),
    );

    const { processMissionExpiration } = await import(
      "../../workers/mission-expiration.js"
    );

    const result = await processMissionExpiration();

    expect(result.processedCount).toBe(1);
    expect(result.expiredCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.releasedClaimsCount).toBe(0);

    // Transaction should NOT have been called
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("should expire a mission when all claims are abandoned (past deadline)", async () => {
    // Select 1: expired missions — returns 1 mission
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([
        { id: MOCK_MISSION_ID_1, currentClaimCount: 1 },
      ]),
    );

    // Select 2: batch claims — none (all abandoned means no active claims returned)
    mockDbSelect.mockReturnValueOnce(
      buildClaimsSelectChain([]),
    );

    // Select 3: next batch — empty
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([]),
    );

    // Transaction: update mission + execute release
    const txUpdateChain = buildTxUpdateChain();
    mockTxUpdate.mockReturnValueOnce(txUpdateChain);
    mockTxExecute.mockResolvedValueOnce([]); // No active/submitted claims to release

    const { processMissionExpiration } = await import(
      "../../workers/mission-expiration.js"
    );

    const result = await processMissionExpiration();

    expect(result.processedCount).toBe(1);
    expect(result.expiredCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.releasedClaimsCount).toBe(0);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("should handle batch processing of multiple expired missions", async () => {
    // Select 1: 3 expired missions
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([
        { id: MOCK_MISSION_ID_1, currentClaimCount: 0 },
        { id: MOCK_MISSION_ID_2, currentClaimCount: 2 },
        { id: MOCK_MISSION_ID_3, currentClaimCount: 0 },
      ]),
    );

    // Select 2: batch claims for ALL 3 missions — all empty (no active claims)
    mockDbSelect.mockReturnValueOnce(
      buildClaimsSelectChain([]),
    );

    // Select 3: next batch — empty
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([]),
    );

    // Transaction mocks for each mission
    // Mission 1: expire + 0 claims released
    mockTxUpdate.mockReturnValueOnce(buildTxUpdateChain());
    mockTxExecute.mockResolvedValueOnce([]);

    // Mission 2: expire + 2 claims released
    mockTxUpdate.mockReturnValueOnce(buildTxUpdateChain());
    mockTxExecute.mockResolvedValueOnce([
      { id: "claim-a" },
      { id: "claim-b" },
    ]);
    // Second update for decrementing currentClaimCount
    mockTxUpdate.mockReturnValueOnce(buildTxUpdateChain());

    // Mission 3: expire + 0 claims released
    mockTxUpdate.mockReturnValueOnce(buildTxUpdateChain());
    mockTxExecute.mockResolvedValueOnce([]);

    const { processMissionExpiration } = await import(
      "../../workers/mission-expiration.js"
    );

    const result = await processMissionExpiration();

    expect(result.processedCount).toBe(3);
    expect(result.expiredCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(result.releasedClaimsCount).toBe(2);
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it("should be idempotent — running twice produces no errors when missions already expired", async () => {
    // First run: 1 expired mission
    mockDbSelect.mockReturnValueOnce(
      buildSelectChain([
        { id: MOCK_MISSION_ID_1, currentClaimCount: 0 },
      ]),
    );
    // Batch claims: none
    mockDbSelect.mockReturnValueOnce(buildClaimsSelectChain([]));
    // Next batch: empty
    mockDbSelect.mockReturnValueOnce(buildSelectChain([]));

    mockTxUpdate.mockReturnValueOnce(buildTxUpdateChain());
    mockTxExecute.mockResolvedValueOnce([]);

    const { processMissionExpiration } = await import(
      "../../workers/mission-expiration.js"
    );

    const result1 = await processMissionExpiration();
    expect(result1.expiredCount).toBe(1);

    // Second run: no expired missions remain (already set to "expired")
    mockDbSelect.mockReturnValueOnce(buildSelectChain([]));

    const result2 = await processMissionExpiration();
    expect(result2.processedCount).toBe(0);
    expect(result2.expiredCount).toBe(0);
    expect(result2.skippedCount).toBe(0);
    expect(result2.releasedClaimsCount).toBe(0);
  });
});
