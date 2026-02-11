/**
 * Mission CRUD Integration Tests (Sprint 7 — T022)
 *
 * 12 tests covering: POST / (create), PATCH /:id (update), DELETE /:id (archive),
 * GET /agent (list own missions).
 *
 * Follows the human-onboarding.test.ts pattern: import route directly,
 * mock requireAgent middleware to bypass API key + bcrypt, mock DB with
 * chainable mocks.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

// DB chainable mocks
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbReturning = vi.fn();

// Transaction mocks
const mockTxInsert = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxReturning = vi.fn();

function resetDbChain() {
  const orderByFn = vi.fn();
  const limitFn = vi.fn().mockResolvedValue([]);
  orderByFn.mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    orderBy: orderByFn,
    returning: mockDbReturning,
  });
  const fromFn = vi.fn().mockReturnValue({
    where: whereFn,
    limit: limitFn,
    orderBy: orderByFn,
  });
  mockDbSelect.mockReturnValue({ from: fromFn });

  const valuesReturningFn = vi.fn().mockReturnValue({ returning: mockDbReturning });
  mockDbInsert.mockReturnValue({ values: valuesReturningFn });

  const setFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  mockDbUpdate.mockReturnValue({ set: setFn });

  return { limitFn, whereFn, fromFn, orderByFn };
}

function resetTxChain() {
  const valuesFn = vi.fn().mockReturnValue({ returning: mockTxReturning });
  mockTxInsert.mockReturnValue({ values: valuesFn });

  const setFn = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ returning: mockTxReturning }),
  });
  mockTxUpdate.mockReturnValue({ set: setFn });
}

const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
  cb({ insert: mockTxInsert, update: mockTxUpdate }),
);

// Mock enqueueForEvaluation
const mockEnqueueForEvaluation = vi.fn().mockResolvedValue("eval-id-123");

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockTransaction,
  })),
  getRedis: vi.fn(() => null),
}));

// Mock requireAgent middleware to bypass API key + bcrypt verification
const MOCK_AGENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MOCK_OTHER_AGENT_ID = "11111111-2222-3333-4444-555555555555";

vi.mock("../../../src/middleware/auth.js", () => ({
  requireAgent: () => {
    return async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("agent", {
        id: MOCK_AGENT_ID,
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
      c: { set: (key: string, value: unknown) => void },
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

vi.mock("../../../src/lib/guardrail-helpers.js", () => ({
  enqueueForEvaluation: (...args: unknown[]) => mockEnqueueForEvaluation(...args),
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

interface PaginatedBody<T = unknown> {
  ok: true;
  data: T[];
  meta: { hasMore: boolean; nextCursor: string | null; count: number };
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Valid mission payload ───────────────────────────────────────────

const MOCK_SOLUTION_ID = "cccccccc-dddd-eeee-ffff-000000000000";
const MOCK_PROBLEM_ID = "dddddddd-eeee-ffff-0000-111111111111";
const MOCK_MISSION_ID = "eeeeeeee-ffff-0000-1111-222222222222";

function validMissionBody() {
  return {
    solutionId: MOCK_SOLUTION_ID,
    title: "Plant 100 trees in downtown park",
    description: "Organize a community tree-planting event to improve urban green coverage and combat heat islands.",
    instructions: [
      { step: 1, text: "Contact local parks department for permits", optional: false },
      { step: 2, text: "Recruit 20 volunteers from neighborhood", optional: false },
      { step: 3, text: "Purchase native seedlings from nursery", optional: false },
    ],
    evidenceRequired: [
      { type: "photo", description: "Before and after photos of the planting area", required: true },
    ],
    requiredSkills: ["gardening", "community organizing"],
    estimatedDurationMinutes: 240,
    difficulty: "intermediate",
    tokenReward: 50,
    maxClaims: 5,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    domain: "environmental_protection",
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Mission CRUD Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();
    mockTxReturning.mockReset();
    mockEnqueueForEvaluation.mockResolvedValue("eval-id-123");
    resetDbChain();
    resetTxChain();

    const missionRoutes = (await import("../../routes/missions/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/missions", missionRoutes);
    app.onError(errorHandler);
  });

  // ── POST / — Create mission ─────────────────────────────────────

  describe("POST / — Create mission", () => {
    it("should create a mission for an approved owned solution", async () => {
      // Query 1: solution lookup — returns owned, approved solution
      // Query 2: problem lookup — returns domain
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: MOCK_SOLUTION_ID,
                  proposedByAgentId: MOCK_AGENT_ID,
                  guardrailStatus: "approved",
                  problemId: MOCK_PROBLEM_ID,
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { domain: "environmental_protection" },
              ]),
            }),
          }),
        });

      // Transaction: insert mission + enqueue guardrail
      const now = new Date();
      mockTxReturning.mockResolvedValueOnce([
        {
          id: MOCK_MISSION_ID,
          guardrailStatus: "pending",
          status: "open",
          createdAt: now,
        },
      ]);

      const res = await app.request("/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMissionBody()),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody<{
        id: string;
        guardrailStatus: string;
        guardrailEvaluationId: string;
        status: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(MOCK_MISSION_ID);
      expect(body.data.guardrailStatus).toBe("pending");
      expect(body.data.guardrailEvaluationId).toBe("eval-id-123");
      expect(body.data.status).toBe("open");
      expect(mockEnqueueForEvaluation).toHaveBeenCalledOnce();
    });

    it("should reject when solution not found", async () => {
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No solution
          }),
        }),
      });

      const res = await app.request("/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMissionBody()),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Solution not found");
    });

    it("should reject when agent does not own the solution", async () => {
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: MOCK_SOLUTION_ID,
                proposedByAgentId: MOCK_OTHER_AGENT_ID, // Different agent
                guardrailStatus: "approved",
                problemId: MOCK_PROBLEM_ID,
              },
            ]),
          }),
        }),
      });

      const res = await app.request("/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMissionBody()),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("your own solutions");
    });

    it("should reject when solution is not approved", async () => {
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: MOCK_SOLUTION_ID,
                proposedByAgentId: MOCK_AGENT_ID,
                guardrailStatus: "pending", // Not approved
                problemId: MOCK_PROBLEM_ID,
              },
            ]),
          }),
        }),
      });

      const res = await app.request("/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMissionBody()),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("approved");
    });

    it("should reject invalid input (empty body)", async () => {
      const res = await app.request("/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject when description is too short", async () => {
      const payload = validMissionBody();
      payload.description = "Too short"; // min 10 chars but schema says min(10), this is exactly 9 chars

      const res = await app.request("/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // "Too short" is 9 chars, schema requires min(10)
      expect(res.status).toBe(422);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── PATCH /:id — Update mission ─────────────────────────────────

  describe("PATCH /:id — Update mission", () => {
    it("should update mission and re-enqueue for guardrail", async () => {
      // Query 1: mission lookup — exists and owned by agent
      // Query 2: active claims check — none
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: MOCK_MISSION_ID,
                  createdByAgentId: MOCK_AGENT_ID,
                  status: "open",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // No active claims
            }),
          }),
        });

      // Transaction: update mission + re-enqueue guardrail
      const now = new Date();
      mockTxReturning.mockResolvedValueOnce([
        {
          id: MOCK_MISSION_ID,
          title: "Updated title",
          description: "Updated description for the mission that is long enough",
          guardrailStatus: "pending",
          status: "open",
          updatedAt: now,
        },
      ]);

      const res = await app.request(`/missions/${MOCK_MISSION_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          description: "Updated description for the mission that is long enough",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        id: string;
        title: string;
        guardrailStatus: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(MOCK_MISSION_ID);
      expect(body.data.title).toBe("Updated title");
      expect(body.data.guardrailStatus).toBe("pending");
      expect(mockEnqueueForEvaluation).toHaveBeenCalledOnce();
    });

    it("should reject update when active claims exist", async () => {
      // Query 1: mission lookup
      // Query 2: active claims check — has one
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: MOCK_MISSION_ID,
                  createdByAgentId: MOCK_AGENT_ID,
                  status: "open",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: "claim-1" }, // Active claim exists
              ]),
            }),
          }),
        });

      const res = await app.request(`/missions/${MOCK_MISSION_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated title" }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("active claims");
    });

    it("should reject when agent does not own mission", async () => {
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: MOCK_MISSION_ID,
                createdByAgentId: MOCK_OTHER_AGENT_ID, // Different agent
                status: "open",
              },
            ]),
          }),
        }),
      });

      const res = await app.request(`/missions/${MOCK_MISSION_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hijacked title" }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("your own missions");
    });
  });

  // ── DELETE /:id — Archive mission ───────────────────────────────

  describe("DELETE /:id — Archive mission", () => {
    it("should archive mission (soft delete)", async () => {
      // Query 1: mission lookup
      // Query 2: active claims check — none
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: MOCK_MISSION_ID,
                  createdByAgentId: MOCK_AGENT_ID,
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // No active claims
            }),
          }),
        });

      // db.update().set().where() — no returning for archive
      const mockSetWhere = vi.fn().mockResolvedValue(undefined);
      const mockSetFn = vi.fn().mockReturnValue({ where: mockSetWhere });
      mockDbUpdate.mockReturnValue({ set: mockSetFn });

      const res = await app.request(`/missions/${MOCK_MISSION_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ id: string; status: string }>;
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(MOCK_MISSION_ID);
      expect(body.data.status).toBe("archived");
    });

    it("should reject archive when active claims exist", async () => {
      // Query 1: mission lookup
      // Query 2: active claims check — has one
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: MOCK_MISSION_ID,
                  createdByAgentId: MOCK_AGENT_ID,
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: "claim-1" }, // Active claim exists
              ]),
            }),
          }),
        });

      const res = await app.request(`/missions/${MOCK_MISSION_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("active claims");
    });

    it("should reject archive when mission not found", async () => {
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // Not found
          }),
        }),
      });

      const res = await app.request(`/missions/${MOCK_MISSION_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  // ── GET /agent — List agent's missions ──────────────────────────

  describe("GET /agent — List agent missions", () => {
    it("should list agent missions with pagination", async () => {
      const now = new Date();
      const missions = [
        {
          id: MOCK_MISSION_ID,
          solutionId: MOCK_SOLUTION_ID,
          title: "Plant trees",
          description: "A tree planting mission",
          domain: "environmental_protection",
          difficulty: "intermediate",
          tokenReward: 50,
          maxClaims: 5,
          currentClaimCount: 2,
          guardrailStatus: "approved",
          status: "open",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: now,
        },
      ];

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(missions), // Exactly 1 row, no hasMore
            }),
          }),
        }),
      });

      const res = await app.request("/missions/agent?limit=20");

      expect(res.status).toBe(200);
      const body = (await res.json()) as PaginatedBody<{
        id: string;
        title: string;
        tokenReward: number;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.id).toBe(MOCK_MISSION_ID);
      expect(body.data[0]!.title).toBe("Plant trees");
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.count).toBe(1);
    });

    it("should return hasMore and nextCursor when more items exist", async () => {
      const now = new Date();
      // Return limit + 1 items to indicate hasMore
      const missionRows = Array.from({ length: 21 }, (_, i) => ({
        id: `mission-${String(i).padStart(3, "0")}`,
        solutionId: MOCK_SOLUTION_ID,
        title: `Mission ${i}`,
        description: `Description ${i}`,
        domain: "environmental_protection",
        difficulty: "intermediate",
        tokenReward: 50,
        maxClaims: 1,
        currentClaimCount: 0,
        guardrailStatus: "approved",
        status: "open",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - i * 1000),
      }));

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(missionRows), // 21 rows > limit of 20
            }),
          }),
        }),
      });

      const res = await app.request("/missions/agent?limit=20");

      expect(res.status).toBe(200);
      const body = (await res.json()) as PaginatedBody<{ id: string }>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(20); // Sliced to limit
      expect(body.meta.hasMore).toBe(true);
      expect(body.meta.nextCursor).toBeTruthy();
      expect(body.meta.count).toBe(20);
    });
  });
});
