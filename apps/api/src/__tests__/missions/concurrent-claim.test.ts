/**
 * Concurrent Mission Claim Tests (Sprint 7 — T031 Race Condition Protection)
 *
 * Verifies that the SELECT FOR UPDATE SKIP LOCKED pattern in POST /:id/claim
 * prevents two humans from claiming the same mission slot simultaneously.
 *
 * Key scenarios:
 *   1. Single claim succeeds (happy path)
 *   2. SKIP LOCKED returns empty row (row locked) → 409 Conflict
 *   3. When maxClaims=1 and two concurrent claims arrive, only one succeeds
 *   4. Mission fully claimed (current_claim_count >= max_claims) → 409 Conflict
 *   5. Human already has 3 active claims → 403 Forbidden
 *   6. Duplicate claim by same human → 409 Conflict
 *   7. Mission not open → 404 Not Found
 *   8. Mission not approved → 404 Not Found
 *   9. Multi-slot mission allows subsequent claims when slots remain
 *  10. Invalid UUID → 422 Validation Error
 *
 * Follows mission-crud.test.ts and messages.test.ts patterns.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

/**
 * Each test configures what the transaction's internal mocks should return.
 * This callback receives the fresh tx mock object and sets up mockResolvedValueOnce
 * chains on tx.execute, tx._insertReturning, etc.
 */
let currentTxSetup: ((tx: TxMock) => void) | null = null;

interface TxMock {
  execute: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  _insertReturning: ReturnType<typeof vi.fn>;
}

/** Build a fresh tx mock object with proper chainable structure. */
function buildTxMock(): TxMock {
  const txExecute = vi.fn();
  const txInsertReturning = vi.fn();
  const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
  const txUpdateSetWhere = vi.fn().mockResolvedValue(undefined);
  const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateSetWhere });
  const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });

  return {
    execute: txExecute,
    insert: txInsert,
    update: txUpdate,
    _insertReturning: txInsertReturning,
  };
}

/** Default transaction implementation: builds a tx, applies currentTxSetup, runs callback. */
function defaultTransactionImpl(cb: (tx: unknown) => Promise<unknown>) {
  const tx = buildTxMock();
  if (currentTxSetup) {
    currentTxSetup(tx);
  }
  return cb(tx);
}

const mockTransaction = vi.fn(defaultTransactionImpl);

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockTransaction,
  })),
  getRedis: vi.fn(() => null),
}));

// Mock humanAuth middleware — supports switching between two human identities
const HUMAN_A_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const HUMAN_B_ID = "bbbbbbbb-1111-2222-3333-444444444444";

let currentHumanId = HUMAN_A_ID;

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("human", {
        id: currentHumanId,
        email: currentHumanId === HUMAN_A_ID ? "alice@example.com" : "bob@example.com",
        displayName: currentHumanId === HUMAN_A_ID ? "Alice" : "Bob",
        role: "user",
      });
      await next();
    };
  },
}));

// Mock requireAgent (needed because mission routes register agent-only routes too)
vi.mock("../../../src/middleware/auth.js", () => ({
  requireAgent: () => {
    return async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("agent", {
        id: "mock-agent-id",
        username: "test-agent",
        framework: "claude",
        claimStatus: "approved",
        rateLimitOverride: null,
      });
      c.set("authRole", "agent");
      await next();
    };
  },
  requireAdmin: () => {
    return async (
      _c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      await next();
    };
  },
  optionalAuth: () => {
    return async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("authRole", "public");
      await next();
    };
  },
}));

// Mock guardrail-helpers (used by create/update routes, not claim, but needed for import)
vi.mock("../../../src/lib/guardrail-helpers.js", () => ({
  enqueueForEvaluation: vi.fn().mockResolvedValue("eval-id-123"),
}));

// Mock logger to suppress noise
vi.mock("../../../src/middleware/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Response types ──────────────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Test constants ──────────────────────────────────────────────────

const MOCK_MISSION_ID = "eeeeeeee-ffff-0000-1111-222222222222";
const MOCK_CLAIM_ID = "cccccccc-dddd-eeee-ffff-000000000000";

// ── Test Suites ─────────────────────────────────────────────────────

describe("Mission Claim — Concurrent Race Condition Protection", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentTxSetup = null;
    currentHumanId = HUMAN_A_ID;

    // Restore default transaction implementation after vi.clearAllMocks wipes it
    mockTransaction.mockImplementation(defaultTransactionImpl);

    const missionRoutes = (await import("../../routes/missions/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/missions", missionRoutes);
    app.onError(errorHandler);
  });

  // ── Happy path: single claim succeeds ───────────────────────────

  it("should successfully claim a mission (happy path)", async () => {
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    currentTxSetup = (tx) => {
      tx.execute
        // 1. SELECT FOR UPDATE SKIP LOCKED — mission found, open, approved, has slots
        .mockResolvedValueOnce([
          {
            id: MOCK_MISSION_ID,
            current_claim_count: 0,
            max_claims: 1,
            status: "open",
            guardrail_status: "approved",
          },
        ])
        // 2. Active claims count — human has 0
        .mockResolvedValueOnce([{ count: 0 }])
        // 3. Duplicate claim check — none
        .mockResolvedValueOnce([]);

      // 4. Insert claim — returning
      tx._insertReturning.mockResolvedValueOnce([
        {
          id: MOCK_CLAIM_ID,
          missionId: MOCK_MISSION_ID,
          humanId: HUMAN_A_ID,
          status: "active",
          claimedAt: now,
          deadlineAt,
          progressPercent: 0,
        },
      ]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as SuccessBody<{
      claimId: string;
      missionId: string;
      status: string;
      claimedAt: string;
      deadlineAt: string;
    }>;
    expect(body.ok).toBe(true);
    expect(body.data.claimId).toBe(MOCK_CLAIM_ID);
    expect(body.data.missionId).toBe(MOCK_MISSION_ID);
    expect(body.data.status).toBe("active");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  // ── SKIP LOCKED: mission row already locked by another transaction ──

  it("should return 409 when SKIP LOCKED returns empty (mission row locked by concurrent transaction)", async () => {
    currentTxSetup = (tx) => {
      // SELECT FOR UPDATE SKIP LOCKED returns empty — row is locked by another tx
      tx.execute.mockResolvedValueOnce([]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("being processed");
    expect(body.error.message).toContain("retry");
  });

  // ── Concurrent claims: maxClaims=1, two humans claim simultaneously ──

  it("should allow only one claim when maxClaims=1 and two concurrent claims race", async () => {
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Track which call number we are on to simulate the race
    let txCallCount = 0;

    // Override mockTransaction to simulate two different transaction outcomes
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      txCallCount++;
      const callNum = txCallCount;
      const tx = buildTxMock();

      if (callNum === 1) {
        // First transaction: successfully acquires lock
        tx.execute
          .mockResolvedValueOnce([
            {
              id: MOCK_MISSION_ID,
              current_claim_count: 0,
              max_claims: 1,
              status: "open",
              guardrail_status: "approved",
            },
          ])
          .mockResolvedValueOnce([{ count: 0 }])
          .mockResolvedValueOnce([]);

        tx._insertReturning.mockResolvedValueOnce([
          {
            id: MOCK_CLAIM_ID,
            missionId: MOCK_MISSION_ID,
            humanId: HUMAN_A_ID,
            status: "active",
            claimedAt: now,
            deadlineAt,
            progressPercent: 0,
          },
        ]);
      } else {
        // Second transaction: SKIP LOCKED returns empty because row is locked by first tx
        tx.execute.mockResolvedValueOnce([]);
      }

      return cb(tx);
    });

    // Human A claims first
    currentHumanId = HUMAN_A_ID;
    const res1 = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    // Human B claims concurrently — SKIP LOCKED returns empty
    currentHumanId = HUMAN_B_ID;
    const res2 = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    // First claim succeeds
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as SuccessBody<{
      claimId: string;
      missionId: string;
      status: string;
    }>;
    expect(body1.ok).toBe(true);
    expect(body1.data.claimId).toBe(MOCK_CLAIM_ID);
    expect(body1.data.status).toBe("active");

    // Second claim fails with 409 Conflict
    expect(res2.status).toBe(409);
    const body2 = (await res2.json()) as ErrorBody;
    expect(body2.ok).toBe(false);
    expect(body2.error.code).toBe("CONFLICT");
    expect(body2.error.message).toContain("being processed");

    // Verify both transactions were invoked
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  // ── Mission fully claimed (no slots left) ─────────────────────────

  it("should return 409 when mission is fully claimed (current_claim_count >= max_claims)", async () => {
    currentTxSetup = (tx) => {
      // Mission found but all slots taken
      tx.execute.mockResolvedValueOnce([
        {
          id: MOCK_MISSION_ID,
          current_claim_count: 1,
          max_claims: 1,
          status: "open",
          guardrail_status: "approved",
        },
      ]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("fully claimed");
    expect(body.error.message).toContain("no slots");
  });

  // ── Human has 3 active claims already ──────────────────────────────

  it("should return 403 when human already has 3 active claims", async () => {
    currentTxSetup = (tx) => {
      tx.execute
        // Mission is available with slots
        .mockResolvedValueOnce([
          {
            id: MOCK_MISSION_ID,
            current_claim_count: 0,
            max_claims: 5,
            status: "open",
            guardrail_status: "approved",
          },
        ])
        // Human already has 3 active claims
        .mockResolvedValueOnce([{ count: 3 }]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("Maximum 3 active missions");
  });

  // ── Duplicate claim by same human ──────────────────────────────────

  it("should return 409 when human already has an active/submitted claim on this mission", async () => {
    currentTxSetup = (tx) => {
      tx.execute
        // Mission is available
        .mockResolvedValueOnce([
          {
            id: MOCK_MISSION_ID,
            current_claim_count: 0,
            max_claims: 5,
            status: "open",
            guardrail_status: "approved",
          },
        ])
        // Human has fewer than 3 active claims overall
        .mockResolvedValueOnce([{ count: 1 }])
        // Duplicate check — existing active claim on this mission
        .mockResolvedValueOnce([{ id: "existing-claim-id" }]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("already claimed");
  });

  // ── Mission not in open/claimed status ─────────────────────────────

  it("should return 404 when mission status is not open or claimed", async () => {
    currentTxSetup = (tx) => {
      tx.execute.mockResolvedValueOnce([
        {
          id: MOCK_MISSION_ID,
          current_claim_count: 0,
          max_claims: 1,
          status: "expired",
          guardrail_status: "approved",
        },
      ]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("not accepting claims");
  });

  // ── Mission not approved by guardrails ─────────────────────────────

  it("should return 404 when mission guardrail_status is not approved", async () => {
    currentTxSetup = (tx) => {
      tx.execute.mockResolvedValueOnce([
        {
          id: MOCK_MISSION_ID,
          current_claim_count: 0,
          max_claims: 1,
          status: "open",
          guardrail_status: "pending",
        },
      ]);
    };

    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("not available");
  });

  // ── Multi-slot mission: second claim succeeds when slots remain ────

  it("should allow second claim on multi-slot mission when slots remain", async () => {
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const secondClaimId = "dddddddd-1111-2222-3333-444444444444";

    currentTxSetup = (tx) => {
      tx.execute
        // Mission has 3 max slots, 1 already claimed — status "claimed" is valid
        .mockResolvedValueOnce([
          {
            id: MOCK_MISSION_ID,
            current_claim_count: 1,
            max_claims: 3,
            status: "claimed",
            guardrail_status: "approved",
          },
        ])
        // Human B has 0 active claims
        .mockResolvedValueOnce([{ count: 0 }])
        // No duplicate claim
        .mockResolvedValueOnce([]);

      tx._insertReturning.mockResolvedValueOnce([
        {
          id: secondClaimId,
          missionId: MOCK_MISSION_ID,
          humanId: HUMAN_B_ID,
          status: "active",
          claimedAt: now,
          deadlineAt,
          progressPercent: 0,
        },
      ]);
    };

    currentHumanId = HUMAN_B_ID;
    const res = await app.request(`/missions/${MOCK_MISSION_ID}/claim`, {
      method: "POST",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as SuccessBody<{
      claimId: string;
      missionId: string;
      status: string;
    }>;
    expect(body.ok).toBe(true);
    expect(body.data.claimId).toBe(secondClaimId);
    expect(body.data.status).toBe("active");
  });

  // ── Invalid mission ID ─────────────────────────────────────────────

  it("should return 422 for invalid mission UUID", async () => {
    const res = await app.request("/missions/not-a-uuid/claim", {
      method: "POST",
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("UUID");
  });
});
