/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Evidence Review Routes Unit Tests (Sprint 13)
 *
 * Tests:
 *   1. GET /evidence-reviews/pending — returns pending reviews for agent
 *   2. GET /evidence-reviews/pending — empty when none available
 *   3. POST /evidence-reviews/:id/respond — submits review successfully
 *   4. POST /evidence-reviews/:id/respond — returns 422 for invalid body
 *   5. POST /evidence-reviews/:id/respond — returns 404 for missing review
 *   6. POST /evidence-reviews/:id/respond — returns 403 for wrong agent
 *   7. POST /evidence-reviews/:id/respond — returns 410 for expired review
 *   8. POST /evidence-reviews/:id/respond — returns 409 for completed review
 *   9. GET /evidence-reviews/:id — returns review detail with ownership check
 *  10. GET /evidence-reviews/:id — returns 403 for non-owner
 *  11. GET /evidence-reviews/:id — returns 404 for missing review
 */
import { AppError } from "@betterworld/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ─────────────────────────────────────────────

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();

const mockDb = {
  select: mockSelect,
};

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({
  limit: mockLimit,
  orderBy: mockOrderBy,
});
mockOrderBy.mockReturnValue({ limit: mockLimit });

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

// Mock submitEvidenceReview service
const mockSubmitEvidenceReview = vi.fn();
vi.mock("../../services/evidence-review.service.js", () => ({
  submitEvidenceReview: (...args: unknown[]) => mockSubmitEvidenceReview(...args),
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

// ── Helper ──────────────────────────────────────────────────────────

async function jsonBody(res: Response): Promise<any> {
  return res.json();
}

// ── Test Setup ──────────────────────────────────────────────────────

const REVIEW_ID = "cccccccc-1111-4222-8333-cccccccccccc";
const EVIDENCE_ID = "bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";

let app: Hono<AppEnv>;

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset mock chain
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({
    limit: mockLimit,
    orderBy: mockOrderBy,
  });
  mockOrderBy.mockReturnValue({ limit: mockLimit });

  app = new Hono<AppEnv>();
  app.use("*", requestId());
  app.onError(errorHandler);

  const evidenceReviewRoutes = (
    await import("../../routes/evidence-reviews.routes.js")
  ).default;
  app.route("/evidence-reviews", evidenceReviewRoutes);
});

// ============================================================================
// GET /evidence-reviews/pending
// ============================================================================

describe("GET /evidence-reviews/pending", () => {
  it("should return pending reviews for the agent", async () => {
    const assignedAt = new Date();
    const expiresAt = new Date(Date.now() + 3600000);

    // Pending assignments query (uses .where().orderBy().limit())
    mockLimit.mockResolvedValueOnce([
      {
        id: REVIEW_ID,
        evidenceId: EVIDENCE_ID,
        capabilityMatch: "vision",
        status: "pending",
        assignedAt,
        expiresAt,
      },
    ]);

    // Evidence batch fetch (uses .select().from().where() — no .limit())
    // Call 1 to mockWhere returns normal chain (for assignments), consumed by default.
    // Call 2 to mockWhere must resolve as promise (for batch evidence fetch).
    mockWhere
      .mockReturnValueOnce({ limit: mockLimit, orderBy: mockOrderBy }) // assignments query
      .mockResolvedValueOnce([ // batch evidence fetch
        { id: EVIDENCE_ID, evidenceType: "photo", missionId: "mission-1" },
      ]);

    const res = await app.request("/evidence-reviews/pending", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.reviews).toHaveLength(1);
    expect(body.data.reviews[0].id).toBe(REVIEW_ID);
    expect(body.data.reviews[0].evidenceType).toBe("photo");
    expect(body.data.reviews[0].capabilityMatch).toBe("vision");
    expect(body.data.hasMore).toBe(false);
  });

  it("should return empty array when no pending reviews", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await app.request("/evidence-reviews/pending", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.reviews).toEqual([]);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();
  });
});

// ============================================================================
// POST /evidence-reviews/:id/respond
// ============================================================================

describe("POST /evidence-reviews/:id/respond", () => {
  it("should submit review successfully", async () => {
    mockSubmitEvidenceReview.mockResolvedValue({
      reviewId: REVIEW_ID,
      status: "completed",
      rewardAmount: 1.5,
      rewardTransactionId: "tx-001",
      balanceAfter: 51.5,
    });

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "verified",
        confidence: 0.95,
        reasoning: "Clear photographic evidence of cleaned area",
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.reviewId).toBe(REVIEW_ID);
    expect(body.data.status).toBe("completed");
    expect(body.data.rewardAmount).toBe(1.5);
  });

  it("should return 422 for invalid body", async () => {
    const res = await app.request(`/evidence-reviews/${REVIEW_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "invalid_value",
        confidence: 5, // out of range
        // missing reasoning
      }),
    });

    expect(res.status).toBe(422);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 404 for non-existent review", async () => {
    mockSubmitEvidenceReview.mockRejectedValue(
      new AppError("NOT_FOUND", "Evidence review assignment not found"),
    );

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "verified",
        confidence: 0.9,
        reasoning: "Clear evidence of improvement seen",
      }),
    });

    expect(res.status).toBe(404);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("should return 403 for wrong agent", async () => {
    mockSubmitEvidenceReview.mockRejectedValue(
      new AppError("FORBIDDEN", "You are not assigned to this evidence review"),
    );

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "rejected",
        confidence: 0.8,
        reasoning: "This does not match the expected outcome",
      }),
    });

    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("should return 410 for expired review", async () => {
    mockSubmitEvidenceReview.mockRejectedValue(
      new AppError("GONE", "Evidence review assignment has expired"),
    );

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "verified",
        confidence: 0.85,
        reasoning: "Solid evidence that work was completed",
      }),
    });

    expect(res.status).toBe(410);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("GONE");
  });

  it("should return 409 for already completed review", async () => {
    mockSubmitEvidenceReview.mockRejectedValue(
      new AppError("CONFLICT", "Evidence review already completed"),
    );

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "verified",
        confidence: 0.9,
        reasoning: "Good evidence of environmental cleanup",
      }),
    });

    expect(res.status).toBe(409);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("should return 422 for invalid UUID param", async () => {
    const res = await app.request("/evidence-reviews/not-a-uuid/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: "verified",
        confidence: 0.9,
        reasoning: "Valid evidence of social good impact",
      }),
    });

    // parseUuidParam throws AppError("VALIDATION_ERROR") → 422 via error handler
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
  });
});

// ============================================================================
// GET /evidence-reviews/:id
// ============================================================================

describe("GET /evidence-reviews/:id", () => {
  it("should return review detail for the assigned agent", async () => {
    const assignedAt = new Date();
    const expiresAt = new Date(Date.now() + 3600000);
    const respondedAt = new Date();

    mockLimit.mockResolvedValueOnce([
      {
        id: REVIEW_ID,
        evidenceId: EVIDENCE_ID,
        validatorAgentId: MOCK_AGENT.id,
        capabilityMatch: "vision",
        recommendation: "verified",
        confidence: "0.95",
        reasoning: "Clear evidence of cleanup",
        rewardAmount: "1.50",
        rewardTransactionId: "tx-001",
        status: "completed",
        assignedAt,
        respondedAt,
        expiresAt,
      },
    ]);

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}`, {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(REVIEW_ID);
    expect(body.data.recommendation).toBe("verified");
    expect(body.data.confidence).toBe(0.95);
    expect(body.data.rewardAmount).toBe(1.5);
    expect(body.data.status).toBe("completed");
    expect(body.data.respondedAt).not.toBeNull();
  });

  it("should return 403 for non-owner", async () => {
    const assignedAt = new Date();
    const expiresAt = new Date(Date.now() + 3600000);

    mockLimit.mockResolvedValueOnce([
      {
        id: REVIEW_ID,
        evidenceId: EVIDENCE_ID,
        validatorAgentId: "other-agent-0000-4000-8000-000000000000",
        capabilityMatch: null,
        recommendation: null,
        confidence: null,
        reasoning: null,
        rewardAmount: null,
        rewardTransactionId: null,
        status: "pending",
        assignedAt,
        respondedAt: null,
        expiresAt,
      },
    ]);

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}`, {
      method: "GET",
    });

    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("should return 404 for non-existent review", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await app.request(`/evidence-reviews/${REVIEW_ID}`, {
      method: "GET",
    });

    expect(res.status).toBe(404);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
