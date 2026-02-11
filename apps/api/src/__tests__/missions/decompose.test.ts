/**
 * Mission Decomposition Integration Tests (Sprint 7 — T022)
 *
 * 8 tests covering: POST /:solutionId/decompose (Claude Sonnet decomposition)
 * - success path, solution not found, ownership check, approval check,
 *   rate limit enforcement, Claude API error, missing tool_use block,
 *   parent problem not found.
 *
 * Follows the mission-crud.test.ts pattern: import route directly,
 * mock requireAgent middleware to bypass API key + bcrypt, mock DB with
 * per-query chainable mocks.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
  })),
  getRedis: vi.fn(() => mockRedis),
}));

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Mock requireAgent middleware to bypass API key + bcrypt verification
const MOCK_AGENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MOCK_OTHER_AGENT_ID = "11111111-2222-3333-4444-555555555555";
const MOCK_SOLUTION_ID = "cccccccc-dddd-eeee-ffff-000000000000";
const MOCK_PROBLEM_ID = "dddddddd-eeee-ffff-0000-111111111111";

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

// Mock Redis for rate limiting
const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  incrby: vi.fn().mockResolvedValue(1),
};

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

// ── Mock data ───────────────────────────────────────────────────────

const mockSolution = {
  id: MOCK_SOLUTION_ID,
  title: "Urban Reforestation Initiative",
  description: "Plant native trees in urban areas to combat heat islands and improve air quality",
  approach: "Community-driven tree planting with local nursery partnerships",
  proposedByAgentId: MOCK_AGENT_ID,
  guardrailStatus: "approved",
  problemId: MOCK_PROBLEM_ID,
  requiredSkills: ["gardening", "community organizing"],
};

const mockProblem = {
  id: MOCK_PROBLEM_ID,
  domain: "environmental_protection",
  title: "Urban Heat Island Effect",
};

const mockAnthropicResponse = {
  content: [
    {
      type: "tool_use",
      id: "tool-1",
      name: "create_missions",
      input: {
        missions: [
          {
            title: "Plant trees in downtown park",
            description: "Organize tree planting event in the central park area",
            instructions: [
              { step: 1, text: "Get permits from local parks department", optional: false },
              { step: 2, text: "Source native seedlings from nursery", optional: false },
              { step: 3, text: "Recruit 10 volunteers", optional: false },
            ],
            evidenceRequired: [
              { type: "photo", description: "Before and after photos of planting area", required: true },
            ],
            requiredSkills: ["gardening"],
            estimatedDurationMinutes: 120,
            difficulty: "intermediate",
            suggestedTokenReward: 25,
          },
          {
            title: "Map urban heat zones",
            description: "Survey and document temperature variations across the downtown district",
            instructions: [
              { step: 1, text: "Obtain infrared thermometer", optional: false },
              { step: 2, text: "Measure temperatures at 20 locations", optional: false },
              { step: 3, text: "Record data in spreadsheet", optional: false },
            ],
            evidenceRequired: [
              { type: "document", description: "Completed temperature spreadsheet", required: true },
            ],
            requiredSkills: ["data collection"],
            estimatedDurationMinutes: 180,
            difficulty: "beginner",
            suggestedTokenReward: 20,
          },
          {
            title: "Community awareness workshop",
            description: "Host a workshop to educate residents about urban reforestation benefits",
            instructions: [
              { step: 1, text: "Book community center room", optional: false },
              { step: 2, text: "Prepare presentation materials", optional: false },
              { step: 3, text: "Invite 30+ residents", optional: false },
            ],
            evidenceRequired: [
              { type: "photo", description: "Workshop attendance photo", required: true },
              { type: "document", description: "Sign-in sheet", required: true },
            ],
            requiredSkills: ["public speaking", "community organizing"],
            estimatedDurationMinutes: 90,
            difficulty: "intermediate",
            suggestedTokenReward: 30,
          },
        ],
      },
    },
  ],
  usage: { input_tokens: 500, output_tokens: 800 },
};

// ── Helper to build per-query mock chains ───────────────────────────

function mockSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Mission Decomposition Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.incrby.mockResolvedValue(1);
    mockCreate.mockReset();

    const decomposeRoutes = (await import("../../routes/missions/decompose.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/solutions", decomposeRoutes);
    app.onError(errorHandler);
  });

  // ── POST /:solutionId/decompose ──────────────────────────────────

  describe("POST /:solutionId/decompose — Decompose solution", () => {
    it("should successfully decompose an approved owned solution", async () => {
      // Query 1: solution lookup — owned and approved
      // Query 2: problem lookup — returns domain
      mockDbSelect
        .mockReturnValueOnce(mockSelectChain([mockSolution]))
        .mockReturnValueOnce(mockSelectChain([mockProblem]));

      // Mock Claude Sonnet response
      mockCreate.mockResolvedValueOnce(mockAnthropicResponse);

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        solutionId: string;
        suggestedMissions: unknown[];
        decompositionId: string;
        tokensUsed: { input: number; output: number };
        dailyDecompositionsRemaining: number;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.solutionId).toBe(MOCK_SOLUTION_ID);
      expect(body.data.suggestedMissions).toHaveLength(3);
      expect(body.data.decompositionId).toBeTruthy();
      expect(body.data.tokensUsed.input).toBe(500);
      expect(body.data.tokensUsed.output).toBe(800);
      expect(body.data.dailyDecompositionsRemaining).toBe(10);
      expect(mockCreate).toHaveBeenCalledOnce();

      // Verify rate limit counter was incremented
      expect(mockRedis.incr).toHaveBeenCalled();
      // Verify cost tracking
      expect(mockRedis.incrby).toHaveBeenCalled();
    });

    it("should reject when solution not found", async () => {
      mockDbSelect.mockReturnValueOnce(mockSelectChain([])); // No solution

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Solution not found");
      // Claude should never be called
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should reject when agent does not own the solution", async () => {
      const otherAgentSolution = {
        ...mockSolution,
        proposedByAgentId: MOCK_OTHER_AGENT_ID,
      };
      mockDbSelect.mockReturnValueOnce(mockSelectChain([otherAgentSolution]));

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("your own solutions");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should reject when solution is not approved", async () => {
      const pendingSolution = {
        ...mockSolution,
        guardrailStatus: "pending",
      };
      mockDbSelect.mockReturnValueOnce(mockSelectChain([pendingSolution]));

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("approved");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should enforce daily rate limit (10/day)", async () => {
      // Solution and problem queries succeed
      mockDbSelect
        .mockReturnValueOnce(mockSelectChain([mockSolution]))
        .mockReturnValueOnce(mockSelectChain([mockProblem]));

      // Redis returns that limit has been reached
      mockRedis.get.mockResolvedValueOnce("10");

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.message).toContain("10 decompositions per day");
      // Claude should never be called when rate limited
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should handle Claude API error gracefully", async () => {
      // Solution and problem queries succeed
      mockDbSelect
        .mockReturnValueOnce(mockSelectChain([mockSolution]))
        .mockReturnValueOnce(mockSelectChain([mockProblem]));

      // Claude API throws an error
      mockCreate.mockRejectedValueOnce(new Error("Anthropic API rate limit exceeded"));

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(503);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("temporarily unavailable");
      // Rate limit should NOT be incremented on failure
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it("should handle missing tool_use block in Claude response", async () => {
      // Solution and problem queries succeed
      mockDbSelect
        .mockReturnValueOnce(mockSelectChain([mockSolution]))
        .mockReturnValueOnce(mockSelectChain([mockProblem]));

      // Claude response with only a text block, no tool_use
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: "I cannot decompose this solution into missions.",
          },
        ],
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(503);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("failed to generate missions");
      // Rate limit should NOT be incremented on failure
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it("should reject when parent problem not found", async () => {
      // Query 1: solution found
      // Query 2: problem not found
      mockDbSelect
        .mockReturnValueOnce(mockSelectChain([mockSolution]))
        .mockReturnValueOnce(mockSelectChain([])); // No problem

      const res = await app.request(`/solutions/${MOCK_SOLUTION_ID}/decompose`, {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Parent problem not found");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should reject when solutionId is not a valid UUID", async () => {
      const res = await app.request("/solutions/not-a-uuid/decompose", {
        method: "POST",
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("solutionId");
      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
