/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Evaluation Routes Unit Tests (Sprint 11 — T015-T018)
 *
 * Tests:
 *   1. GET /pending — returns pending evaluations
 *   2. POST /:id/respond — submits evaluation response
 *   3. POST /:id/respond — self-review defense-in-depth
 *   4. POST /:id/respond — already completed → 409
 *   5. POST /:id/respond — expired → 410
 *   6. GET /:id — returns evaluation details with score mapping
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
};

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({
  limit: mockLimit,
  orderBy: mockOrderBy,
});
mockOrderBy.mockReturnValue({ limit: mockLimit });
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

vi.mock("../../lib/container.js", () => ({
  getDb: vi.fn(() => mockDb),
  getRedis: vi.fn(() => null),
}));

// Mock auth middleware
const MOCK_AGENT = {
  id: "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa",
  username: "test-validator",
  role: "agent",
};

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

// Mock consensus engine
const mockComputeConsensus = vi.fn();
vi.mock("../../services/consensus-engine.js", () => ({
  computeConsensus: (...args: unknown[]) => mockComputeConsensus(...args),
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

// ── Test Setup ───────────────────────────────────────────────────────

let app: Hono<AppEnv>;

beforeEach(async () => {
  vi.clearAllMocks();

  app = new Hono<AppEnv>();
  app.use("*", requestId());
  app.onError(errorHandler);

  const evaluationsRoutes = (await import("../../routes/evaluations.routes.js")).default;
  app.route("/evaluations", evaluationsRoutes);
});

describe("GET /evaluations/pending", () => {
  it("should return pending evaluations for the validator", async () => {
    const assignedAt = new Date();
    const expiresAt = new Date(Date.now() + 1800000);

    // pending evaluations
    mockLimit.mockResolvedValueOnce([
      {
        id: "eval-1",
        submissionId: "sub-1",
        submissionType: "problem",
        assignedAt,
        expiresAt,
      },
    ]);

    // Note: Batch enrichment (T018) now uses .where(inArray(...)) without .limit(),
    // so it does not go through mockLimit. The try-catch in the route handles the
    // non-array return gracefully (maps remain empty).

    const res = await app.request("/evaluations/pending");
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.evaluations).toHaveLength(1);
    expect(data.data.evaluations[0].submissionType).toBe("problem");
    expect(data.data.evaluations[0].rubric).toBeDefined();
    expect(data.data.hasMore).toBe(false);
  });
});

describe("POST /evaluations/:id/respond", () => {
  it("should accept a valid evaluation response", async () => {
    const expiresAt = new Date(Date.now() + 1800000);

    // Fetch evaluation
    mockLimit.mockResolvedValueOnce([{
      id: "eval-1",
      validatorAgentId: MOCK_AGENT.id,
      validatorId: "val-1",
      status: "pending",
      expiresAt,
      submissionId: "sub-1",
      submissionType: "problem",
    }]);

    // Self-review check: get submission agent
    mockLimit.mockResolvedValueOnce([{ agentId: "different-agent" }]);

    // computeConsensus
    mockComputeConsensus.mockResolvedValueOnce(null); // quorum not met yet

    const body = {
      recommendation: "approved",
      confidence: 0.85,
      scores: {
        domainAlignment: 4,
        factualAccuracy: 3,
        impactPotential: 5,
      },
      reasoning: "This is a well-documented problem with clear evidence of infrastructure damage that needs attention from local authorities.",
      safetyFlagged: false,
    };

    const res = await app.request("/evaluations/eval-1/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe("completed");
    expect(data.data.consensusReached).toBe(false);
  });

  it("should return 403 for self-review (defense-in-depth T018)", async () => {
    const expiresAt = new Date(Date.now() + 1800000);

    // Fetch evaluation
    mockLimit.mockResolvedValueOnce([{
      id: "eval-1",
      validatorAgentId: MOCK_AGENT.id,
      validatorId: "val-1",
      status: "pending",
      expiresAt,
      submissionId: "sub-1",
      submissionType: "problem",
    }]);

    // Self-review check: submission is by the SAME agent
    mockLimit.mockResolvedValueOnce([{ agentId: MOCK_AGENT.id }]);

    const body = {
      recommendation: "approved",
      confidence: 0.85,
      scores: { domainAlignment: 4, factualAccuracy: 3, impactPotential: 5 },
      reasoning: "This is a well-documented problem with clear evidence of infrastructure damage that needs attention from local authorities.",
      safetyFlagged: false,
    };

    const res = await app.request("/evaluations/eval-1/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(403);
    const data = (await res.json()) as any;
    expect(data.error.message).toContain("own submission");
  });

  it("should return 409 for already-completed evaluation", async () => {
    const expiresAt = new Date(Date.now() + 1800000);

    mockLimit.mockResolvedValueOnce([{
      id: "eval-1",
      validatorAgentId: MOCK_AGENT.id,
      validatorId: "val-1",
      status: "completed", // already done
      expiresAt,
      submissionId: "sub-1",
      submissionType: "problem",
    }]);

    const body = {
      recommendation: "approved",
      confidence: 0.85,
      scores: { domainAlignment: 4, factualAccuracy: 3, impactPotential: 5 },
      reasoning: "This is a well-documented problem with clear evidence of infrastructure damage that needs attention from local authorities.",
      safetyFlagged: false,
    };

    const res = await app.request("/evaluations/eval-1/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(409);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("CONFLICT");
  });

  it("should return 410 for expired evaluation", async () => {
    const expiresAt = new Date(Date.now() - 60000); // expired 1 min ago

    mockLimit.mockResolvedValueOnce([{
      id: "eval-1",
      validatorAgentId: MOCK_AGENT.id,
      validatorId: "val-1",
      status: "pending",
      expiresAt,
      submissionId: "sub-1",
      submissionType: "problem",
    }]);

    const body = {
      recommendation: "approved",
      confidence: 0.85,
      scores: { domainAlignment: 4, factualAccuracy: 3, impactPotential: 5 },
      reasoning: "This is a well-documented problem with clear evidence of infrastructure damage that needs attention from local authorities.",
      safetyFlagged: false,
    };

    const res = await app.request("/evaluations/eval-1/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(410);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("GONE");
  });

  it("should return 404 for non-existent evaluation", async () => {
    mockLimit.mockResolvedValueOnce([]); // not found

    const body = {
      recommendation: "approved",
      confidence: 0.85,
      scores: { domainAlignment: 4, factualAccuracy: 3, impactPotential: 5 },
      reasoning: "This is a well-documented problem with clear evidence of infrastructure damage that needs attention from local authorities.",
      safetyFlagged: false,
    };

    const res = await app.request("/evaluations/nonexistent/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(404);
  });

  it("should return 403 when another validator tries to respond", async () => {
    const expiresAt = new Date(Date.now() + 1800000);

    mockLimit.mockResolvedValueOnce([{
      id: "eval-1",
      validatorAgentId: "different-agent-id", // NOT the mock agent
      validatorId: "val-1",
      status: "pending",
      expiresAt,
      submissionId: "sub-1",
      submissionType: "problem",
    }]);

    const body = {
      recommendation: "approved",
      confidence: 0.85,
      scores: { domainAlignment: 4, factualAccuracy: 3, impactPotential: 5 },
      reasoning: "This is a well-documented problem with clear evidence of infrastructure damage that needs attention from local authorities.",
      safetyFlagged: false,
    };

    const res = await app.request("/evaluations/eval-1/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(403);
    const data = (await res.json()) as any;
    expect(data.error.message).toContain("not assigned");
  });

  it("should return 422 for invalid request body", async () => {
    const body = {
      recommendation: "invalid-value",
      confidence: 2.0, // out of range
    };

    const res = await app.request("/evaluations/eval-1/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(422);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });
});
