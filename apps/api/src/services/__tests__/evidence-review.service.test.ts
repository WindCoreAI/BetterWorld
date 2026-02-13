/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Evidence Review Service Unit Tests (Sprint 13)
 *
 * Tests:
 *   1. assignEvidenceReviewers — disabled flag returns fallback
 *   2. assignEvidenceReviewers — prioritizes vision capability for photo evidence
 *   3. assignEvidenceReviewers — fallback when fewer than MIN_EVIDENCE_REVIEWERS available
 *   4. assignEvidenceReviewers — returns empty when no validators available
 *   5. assignEvidenceReviewers — returns fallback when evidence not found
 *   6. submitEvidenceReview — successful review with reward
 *   7. submitEvidenceReview — rejects expired assignment
 *   8. submitEvidenceReview — rejects duplicate (already completed)
 *   9. submitEvidenceReview — rejects wrong agent
 *  10. submitEvidenceReview — throws when assignment not found
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────

const mockGetFlag = vi.hoisted(() => vi.fn());
const mockEarnCredits = vi.hoisted(() => vi.fn());

vi.mock("../feature-flags.js", () => ({
  getFlag: mockGetFlag,
}));

vi.mock("../agent-credit.service.js", () => ({
  AgentCreditService: vi.fn().mockImplementation(() => ({
    earnCredits: mockEarnCredits,
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

import {
  assignEvidenceReviewers,
  submitEvidenceReview,
} from "../evidence-review.service.js";

// ── Test Setup ─────────────────────────────────────────────────────

const AGENT_ID = "aaaaaaaa-1111-4222-8333-aaaaaaaaaaaa";
const EVIDENCE_ID = "bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";
const REVIEW_ID = "cccccccc-1111-4222-8333-cccccccccccc";
const HUMAN_ID = "11111111-2222-4333-8444-555555555555";

/**
 * Creates a fresh per-query mock chain.
 * Each call to createSelectChain() gives an independent chain so queries
 * don't interfere with each other.
 */
function createSelectChain(result: any) {
  const limitFn = vi.fn().mockResolvedValue(result);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn, where: whereFn, limit: limitFn };
}

/** Chain for queries that resolve at .where() (no .limit()) */
function createSelectChainNoLimit(result: any) {
  const whereFn = vi.fn().mockResolvedValue(result);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn, where: whereFn };
}

function createInsertChain(result: any) {
  const returningFn = vi.fn().mockResolvedValue(result);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  return { values: valuesFn, returning: returningFn };
}

function createUpdateChain() {
  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  return { set: setFn, where: updateWhereFn };
}

let mockDb: any;
let mockRedis: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockEarnCredits.mockReset();
  mockGetFlag.mockReset();

  mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
  };
});

// ============================================================================
// assignEvidenceReviewers
// ============================================================================

describe("assignEvidenceReviewers", () => {
  it("should return fallback when EVIDENCE_REVIEW_ENABLED is false", async () => {
    mockGetFlag.mockResolvedValue(false);

    const result = await assignEvidenceReviewers(
      mockDb as unknown as PostgresJsDatabase,
      mockRedis as unknown as Redis,
      EVIDENCE_ID,
      "photo",
    );

    expect(result).toEqual({ assigned: 0, fallbackToAi: true, assignmentIds: [] });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("should prioritize vision-capable validators for photo evidence", async () => {
    mockGetFlag.mockResolvedValue(true);

    // Query 1: evidence record
    const evidenceChain = createSelectChain([{ submittedByHumanId: HUMAN_ID }]);
    // Query 2: validators (no .limit())
    const validatorChain = createSelectChainNoLimit([
      { id: "v1", agentId: "agent-1", capabilities: ["vision"], tier: "journeyman", f1Score: "0.8500" },
      { id: "v2", agentId: "agent-2", capabilities: ["document_review"], tier: "expert", f1Score: "0.9500" },
      { id: "v3", agentId: "agent-3", capabilities: ["vision", "geo_verification"], tier: "apprentice", f1Score: "0.7000" },
    ]);

    mockDb.select
      .mockReturnValueOnce(evidenceChain)
      .mockReturnValueOnce(validatorChain);

    // 3 insert calls
    const ins1 = createInsertChain([{ id: "assign-1" }]);
    const ins2 = createInsertChain([{ id: "assign-2" }]);
    const ins3 = createInsertChain([{ id: "assign-3" }]);
    mockDb.insert
      .mockReturnValueOnce(ins1)
      .mockReturnValueOnce(ins2)
      .mockReturnValueOnce(ins3);

    const result = await assignEvidenceReviewers(
      mockDb as unknown as PostgresJsDatabase,
      mockRedis as unknown as Redis,
      EVIDENCE_ID,
      "photo",
    );

    expect(result.assigned).toBe(3);
    expect(result.fallbackToAi).toBe(false);
    expect(result.assignmentIds).toEqual(["assign-1", "assign-2", "assign-3"]);
  });

  it("should return fallbackToAi=true when fewer than MIN_EVIDENCE_REVIEWERS available", async () => {
    mockGetFlag.mockResolvedValue(true);

    const evidenceChain = createSelectChain([{ submittedByHumanId: HUMAN_ID }]);
    const validatorChain = createSelectChainNoLimit([
      { id: "v1", agentId: "agent-1", capabilities: ["vision"], tier: "journeyman", f1Score: "0.8500" },
      { id: "v2", agentId: "agent-2", capabilities: [], tier: "apprentice", f1Score: "0.7000" },
    ]);

    mockDb.select
      .mockReturnValueOnce(evidenceChain)
      .mockReturnValueOnce(validatorChain);

    const ins1 = createInsertChain([{ id: "assign-1" }]);
    const ins2 = createInsertChain([{ id: "assign-2" }]);
    mockDb.insert
      .mockReturnValueOnce(ins1)
      .mockReturnValueOnce(ins2);

    const result = await assignEvidenceReviewers(
      mockDb as unknown as PostgresJsDatabase,
      mockRedis as unknown as Redis,
      EVIDENCE_ID,
      "photo",
    );

    expect(result.assigned).toBe(2);
    expect(result.fallbackToAi).toBe(true);
  });

  it("should return fallbackToAi=true when no validators available", async () => {
    mockGetFlag.mockResolvedValue(true);

    const evidenceChain = createSelectChain([{ submittedByHumanId: HUMAN_ID }]);
    const validatorChain = createSelectChainNoLimit([]);

    mockDb.select
      .mockReturnValueOnce(evidenceChain)
      .mockReturnValueOnce(validatorChain);

    const result = await assignEvidenceReviewers(
      mockDb as unknown as PostgresJsDatabase,
      mockRedis as unknown as Redis,
      EVIDENCE_ID,
      "text_report",
    );

    expect(result.assigned).toBe(0);
    expect(result.fallbackToAi).toBe(true);
    expect(result.assignmentIds).toEqual([]);
  });

  it("should return fallbackToAi=true when evidence not found", async () => {
    mockGetFlag.mockResolvedValue(true);

    const evidenceChain = createSelectChain([]);
    mockDb.select.mockReturnValueOnce(evidenceChain);

    const result = await assignEvidenceReviewers(
      mockDb as unknown as PostgresJsDatabase,
      mockRedis as unknown as Redis,
      EVIDENCE_ID,
      "photo",
    );

    expect(result.assigned).toBe(0);
    expect(result.fallbackToAi).toBe(true);
  });
});

// ============================================================================
// submitEvidenceReview
// ============================================================================

describe("submitEvidenceReview", () => {
  it("should submit review and earn credits", async () => {
    const futureExpiry = new Date(Date.now() + 3600000);

    // Fetch assignment
    const selectChain = createSelectChain([
      {
        id: REVIEW_ID,
        validatorAgentId: AGENT_ID,
        status: "pending",
        expiresAt: futureExpiry,
        evidenceId: EVIDENCE_ID,
      },
    ]);
    mockDb.select.mockReturnValueOnce(selectChain);

    // Two updates
    const upd1 = createUpdateChain();
    const upd2 = createUpdateChain();
    mockDb.update.mockReturnValueOnce(upd1).mockReturnValueOnce(upd2);

    // earnCredits
    mockEarnCredits.mockResolvedValue({
      transactionId: "tx-001",
      balanceAfter: 51.5,
    });

    const result = await submitEvidenceReview(
      mockDb as unknown as PostgresJsDatabase,
      REVIEW_ID,
      AGENT_ID,
      "verified",
      0.95,
      "Clear evidence of environmental improvement",
    );

    expect(result.reviewId).toBe(REVIEW_ID);
    expect(result.status).toBe("completed");
    expect(result.rewardAmount).toBe(1.5);
    expect(result.rewardTransactionId).toBe("tx-001");
    expect(result.balanceAfter).toBe(51.5);

    expect(mockEarnCredits).toHaveBeenCalledWith(
      AGENT_ID,
      1.5,
      "earn_evidence_review",
      EVIDENCE_ID,
      `evidence_review:${REVIEW_ID}`,
      expect.stringContaining("1.5"),
    );
  });

  it("should reject expired assignment", async () => {
    const pastExpiry = new Date(Date.now() - 3600000);

    const selectChain = createSelectChain([
      {
        id: REVIEW_ID,
        validatorAgentId: AGENT_ID,
        status: "pending",
        expiresAt: pastExpiry,
        evidenceId: EVIDENCE_ID,
      },
    ]);
    mockDb.select.mockReturnValueOnce(selectChain);

    await expect(
      submitEvidenceReview(
        mockDb as unknown as PostgresJsDatabase,
        REVIEW_ID,
        AGENT_ID,
        "verified",
        0.9,
        "Looks good to me and validated",
      ),
    ).rejects.toThrow("expired");
  });

  it("should reject already completed review", async () => {
    const futureExpiry = new Date(Date.now() + 3600000);

    const selectChain = createSelectChain([
      {
        id: REVIEW_ID,
        validatorAgentId: AGENT_ID,
        status: "completed",
        expiresAt: futureExpiry,
        evidenceId: EVIDENCE_ID,
      },
    ]);
    mockDb.select.mockReturnValueOnce(selectChain);

    await expect(
      submitEvidenceReview(
        mockDb as unknown as PostgresJsDatabase,
        REVIEW_ID,
        AGENT_ID,
        "verified",
        0.9,
        "Evidence looks solid to me",
      ),
    ).rejects.toThrow("already completed");
  });

  it("should reject wrong agent", async () => {
    const futureExpiry = new Date(Date.now() + 3600000);

    const selectChain = createSelectChain([
      {
        id: REVIEW_ID,
        validatorAgentId: "other-agent-0000-4000-8000-000000000000",
        status: "pending",
        expiresAt: futureExpiry,
        evidenceId: EVIDENCE_ID,
      },
    ]);
    mockDb.select.mockReturnValueOnce(selectChain);

    await expect(
      submitEvidenceReview(
        mockDb as unknown as PostgresJsDatabase,
        REVIEW_ID,
        AGENT_ID,
        "verified",
        0.9,
        "Verified and confirmed evidence",
      ),
    ).rejects.toThrow("not assigned");
  });

  it("should throw when assignment not found", async () => {
    const selectChain = createSelectChain([]);
    mockDb.select.mockReturnValueOnce(selectChain);

    await expect(
      submitEvidenceReview(
        mockDb as unknown as PostgresJsDatabase,
        REVIEW_ID,
        AGENT_ID,
        "verified",
        0.9,
        "Clear evidence of social good",
      ),
    ).rejects.toThrow("not found");
  });
});
