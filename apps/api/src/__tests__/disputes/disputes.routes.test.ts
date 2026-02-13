/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dispute Routes Unit Tests (Sprint 13 — Consensus Disputes)
 *
 * Tests:
 *   1. POST /disputes — file dispute (success, feature flag, validation)
 *   2. GET /disputes — list own disputes (pagination)
 *   3. GET /disputes/:id — dispute detail (found, not found, ownership)
 *   4. GET /disputes/admin/queue — admin dispute queue
 *   5. POST /disputes/admin/:id/resolve — admin resolve (upheld, dismissed, validation)
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock agents ─────────────────────────────────────────────────

const MOCK_AGENT = {
  id: "aaaabbbb-cccc-4ddd-8eee-ffffffffffff",
  username: "test-agent",
  framework: "openclaw",
  claimStatus: "verified" as const,
  rateLimitOverride: null,
};

const MOCK_HUMAN = {
  id: "eeeeffff-aaaa-4bbb-8ccc-dddddddddddd",
  email: "admin@test.com",
  displayName: "Admin User",
  role: "admin",
};

const CONSENSUS_ID = "ccccdddd-eeee-4fff-8aaa-bbbbbbbbbbbb";
const DISPUTE_ID = "ddddeeee-ffff-4aaa-8bbb-cccccccccccc";

// ── Mock feature flags ──────────────────────────────────────────

let mockDisputesEnabled = true;

vi.mock("../../services/feature-flags.js", () => ({
  getFlag: vi.fn(async (_redis: unknown, name: string) => {
    if (name === "DISPUTES_ENABLED") return mockDisputesEnabled;
    return false;
  }),
  getFeatureFlags: vi.fn(),
  setFlag: vi.fn(),
  resetFlag: vi.fn(),
  invalidateFlagCache: vi.fn(),
}));

// ── Mock dispute service ────────────────────────────────────────

const mockFileDispute = vi.fn();
const mockResolveDispute = vi.fn();

vi.mock("../../services/dispute.service.js", () => ({
  fileDispute: (...args: unknown[]) => mockFileDispute(...args),
  resolveDispute: (...args: unknown[]) => mockResolveDispute(...args),
}));

// ── Mock auth middleware ────────────────────────────────────────

vi.mock("../../middleware/auth.js", () => ({
  requireAgent: () => {
    return async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("agent", MOCK_AGENT);
      c.set("authRole", "agent");
      await next();
    };
  },
}));

vi.mock("../../middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("human", MOCK_HUMAN);
      await next();
    };
  },
}));

vi.mock("../../middleware/requireAdmin.js", () => ({
  requireAdmin: () => {
    return async (
      _c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      await next();
    };
  },
}));

// ── Mock container (DB) ─────────────────────────────────────────

const mockSelectLimit = vi.fn();
const mockSelectOrderBy = vi.fn().mockReturnValue({ limit: mockSelectLimit });
const mockSelectWhere = vi.fn().mockReturnValue({
  limit: mockSelectLimit,
  orderBy: mockSelectOrderBy,
});
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

const mockDb = {
  select: mockSelect,
};

vi.mock("../../lib/container.js", () => ({
  getDb: vi.fn(() => mockDb),
  getRedis: vi.fn(() => null),
}));

// ── Mock pino ───────────────────────────────────────────────────

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────

async function jsonBody(res: Response): Promise<any> {
  return res.json();
}

// ── Test Setup ──────────────────────────────────────────────────

let app: Hono<AppEnv>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockDisputesEnabled = true;
  mockFileDispute.mockReset();
  mockResolveDispute.mockReset();
  mockSelectLimit.mockReset();
  mockSelectOrderBy.mockReset();

  mockSelectWhere.mockReturnValue({
    limit: mockSelectLimit,
    orderBy: mockSelectOrderBy,
  });
  mockSelectOrderBy.mockReturnValue({ limit: mockSelectLimit });

  app = new Hono<AppEnv>();
  app.use("*", requestId());
  app.onError(errorHandler);

  const disputesRoutes = (await import("../../routes/disputes.routes.js")).default;
  app.route("/disputes", disputesRoutes);
});

// ================================================================
// POST /disputes — File dispute
// ================================================================

describe("POST /disputes", () => {
  it("should file a dispute successfully", async () => {
    const now = new Date();
    mockFileDispute.mockResolvedValue({
      id: DISPUTE_ID,
      consensusId: CONSENSUS_ID,
      challengerAgentId: MOCK_AGENT.id,
      stakeAmount: 10,
      reasoning: "The consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content.",
      status: "open",
      createdAt: now,
    });

    const res = await app.request("/disputes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      },
      body: JSON.stringify({
        consensusId: CONSENSUS_ID,
        reasoning: "The consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content.",
      }),
    });

    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(DISPUTE_ID);
    expect(body.data.status).toBe("open");
    expect(mockFileDispute).toHaveBeenCalledWith(
      mockDb,
      MOCK_AGENT.id,
      CONSENSUS_ID,
      expect.any(String),
    );
  });

  it("should return 503 when DISPUTES_ENABLED is false", async () => {
    mockDisputesEnabled = false;

    const res = await app.request("/disputes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      },
      body: JSON.stringify({
        consensusId: CONSENSUS_ID,
        reasoning: "The consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content.",
      }),
    });

    expect(res.status).toBe(503);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("not yet enabled");
  });

  it("should return 422 when reasoning is too short", async () => {
    const res = await app.request("/disputes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      },
      body: JSON.stringify({
        consensusId: CONSENSUS_ID,
        reasoning: "Too short",
      }),
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 422 when consensusId is missing", async () => {
    const res = await app.request("/disputes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      },
      body: JSON.stringify({
        reasoning: "The consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content.",
      }),
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
  });
});

// ================================================================
// GET /disputes — List own disputes
// ================================================================

describe("GET /disputes", () => {
  it("should return paginated list of own disputes", async () => {
    const now = new Date();

    mockSelectLimit.mockResolvedValue([
      {
        id: DISPUTE_ID,
        consensusId: CONSENSUS_ID,
        stakeAmount: 10,
        reasoning: "Test reasoning that is long enough to pass validation.",
        status: "open",
        adminDecision: null,
        stakeReturned: false,
        bonusPaid: false,
        resolvedAt: null,
        createdAt: now,
      },
    ]);

    const res = await app.request("/disputes?limit=10", {
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.disputes).toHaveLength(1);
    expect(body.data.disputes[0].id).toBe(DISPUTE_ID);
    expect(body.data.nextCursor).toBeNull();
  });

  it("should filter by status when provided", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const res = await app.request("/disputes?status=upheld", {
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.disputes).toHaveLength(0);
  });
});

// ================================================================
// GET /disputes/:id — Dispute detail
// ================================================================

describe("GET /disputes/:id", () => {
  it("should return dispute detail for own dispute", async () => {
    const now = new Date();

    mockSelectLimit.mockResolvedValue([
      {
        id: DISPUTE_ID,
        consensusId: CONSENSUS_ID,
        challengerAgentId: MOCK_AGENT.id,
        stakeAmount: 10,
        stakeCreditTransactionId: "tx-1",
        reasoning: "Detailed reasoning about the dispute.",
        status: "open",
        adminReviewerId: null,
        adminDecision: null,
        adminNotes: null,
        stakeReturned: false,
        bonusPaid: false,
        resolvedAt: null,
        createdAt: now,
      },
    ]);

    const res = await app.request(`/disputes/${DISPUTE_ID}`, {
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(DISPUTE_ID);
    expect(body.data.challengerAgentId).toBe(MOCK_AGENT.id);
  });

  it("should return 404 when dispute not found", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const res = await app.request(`/disputes/${DISPUTE_ID}`, {
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });

    expect(res.status).toBe(404);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("should return 403 when dispute belongs to another agent", async () => {
    const now = new Date();

    mockSelectLimit.mockResolvedValue([
      {
        id: DISPUTE_ID,
        consensusId: CONSENSUS_ID,
        challengerAgentId: "other-agent-cccc-4ddd-8eee-ffffffffffff",
        stakeAmount: 10,
        stakeCreditTransactionId: "tx-1",
        reasoning: "Another agent's dispute.",
        status: "open",
        adminReviewerId: null,
        adminDecision: null,
        adminNotes: null,
        stakeReturned: false,
        bonusPaid: false,
        resolvedAt: null,
        createdAt: now,
      },
    ]);

    const res = await app.request(`/disputes/${DISPUTE_ID}`, {
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });

    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("should return 422 for invalid UUID param", async () => {
    const res = await app.request("/disputes/not-a-uuid", {
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ================================================================
// GET /disputes/admin/queue — Admin dispute queue
// ================================================================

describe("GET /disputes/admin/queue", () => {
  it("should return open/admin_review disputes for admin", async () => {
    const now = new Date();

    mockSelectLimit.mockResolvedValue([
      {
        id: DISPUTE_ID,
        consensusId: CONSENSUS_ID,
        challengerAgentId: MOCK_AGENT.id,
        stakeAmount: 10,
        reasoning: "Admin queue dispute reasoning.",
        status: "open",
        createdAt: now,
      },
    ]);

    const res = await app.request("/disputes/admin/queue", {
      method: "GET",
      headers: { Authorization: "Bearer admin-jwt-token" },
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.disputes).toHaveLength(1);
    expect(body.data.disputes[0].status).toBe("open");
  });

  it("should return empty queue when no open disputes", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const res = await app.request("/disputes/admin/queue", {
      method: "GET",
      headers: { Authorization: "Bearer admin-jwt-token" },
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.disputes).toHaveLength(0);
  });
});

// ================================================================
// POST /disputes/admin/:id/resolve — Admin resolve dispute
// ================================================================

describe("POST /disputes/admin/:id/resolve", () => {
  it("should resolve dispute as upheld", async () => {
    const now = new Date();

    mockResolveDispute.mockResolvedValue({
      id: DISPUTE_ID,
      status: "upheld",
      adminDecision: "upheld",
      adminNotes: "The challenger was correct in their assessment of the issue.",
      stakeReturned: true,
      bonusPaid: true,
      resolvedAt: now,
    });

    const res = await app.request(`/disputes/admin/${DISPUTE_ID}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-jwt-token",
      },
      body: JSON.stringify({
        verdict: "upheld",
        adminNotes: "The challenger was correct in their assessment of the issue.",
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("upheld");
    expect(body.data.stakeReturned).toBe(true);
    expect(body.data.bonusPaid).toBe(true);
    expect(mockResolveDispute).toHaveBeenCalledWith(
      mockDb,
      DISPUTE_ID,
      "upheld",
      "The challenger was correct in their assessment of the issue.",
      MOCK_HUMAN.id,
    );
  });

  it("should resolve dispute as dismissed", async () => {
    const now = new Date();

    mockResolveDispute.mockResolvedValue({
      id: DISPUTE_ID,
      status: "dismissed",
      adminDecision: "dismissed",
      adminNotes: "The consensus result was correct, dispute has no merit.",
      stakeReturned: false,
      bonusPaid: false,
      resolvedAt: now,
    });

    const res = await app.request(`/disputes/admin/${DISPUTE_ID}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-jwt-token",
      },
      body: JSON.stringify({
        verdict: "dismissed",
        adminNotes: "The consensus result was correct, dispute has no merit.",
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("dismissed");
    expect(body.data.stakeReturned).toBe(false);
  });

  it("should return 422 for invalid verdict", async () => {
    const res = await app.request(`/disputes/admin/${DISPUTE_ID}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-jwt-token",
      },
      body: JSON.stringify({
        verdict: "invalid_verdict",
        adminNotes: "This is a valid admin note with enough characters.",
      }),
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 422 for too-short adminNotes", async () => {
    const res = await app.request(`/disputes/admin/${DISPUTE_ID}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-jwt-token",
      },
      body: JSON.stringify({
        verdict: "upheld",
        adminNotes: "Short",
      }),
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 422 for invalid dispute UUID param", async () => {
    const res = await app.request("/disputes/admin/not-a-uuid/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-jwt-token",
      },
      body: JSON.stringify({
        verdict: "upheld",
        adminNotes: "Valid admin notes that are long enough.",
      }),
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
