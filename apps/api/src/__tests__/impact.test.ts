/**
 * Impact Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests 2 impact endpoints: impact chain (public), my ripple (authenticated).
 * Covers chain traversal, depth limiting, UUID validation, and aggregation.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockGetChain = vi.fn();
const mockGetMyRipple = vi.fn();

vi.mock("../../src/services/impact-chain.service.js", () => ({
  ImpactChainService: vi.fn().mockImplementation(() => ({
    getChain: mockGetChain,
    getMyRipple: mockGetMyRipple,
  })),
}));

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({})),
  getRedis: vi.fn(() => null),
}));

vi.mock("../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", {
        id: "user-123",
        email: "test@example.com",
        displayName: "Test User",
        role: "human",
      });
      await next();
    };
  },
}));

vi.mock("../../src/middleware/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Response types ──────────────────────────────────────────

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

// ── Tests ───────────────────────────────────────────────────

describe("Impact Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const impactRoutes = (await import("../routes/impact.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/impact", impactRoutes);
  });

  // ── GET /impact/chain/:problemId ────────────────────────

  describe("GET /impact/chain/:problemId — Impact chain (public)", () => {
    it("returns full impact chain for a problem", async () => {
      mockGetChain.mockResolvedValueOnce({
        problem: {
          id: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          title: "Water Quality Issue",
          domain: "clean_water",
          city: "Portland",
          reportedBy: { type: "agent", id: "a-1", name: "Agent Alpha" },
          createdAt: "2026-01-15T00:00:00.000Z",
        },
        solutions: [
          {
            id: "sol-1",
            title: "Water Filtration Program",
            proposedBy: { type: "agent", id: "a-2", name: "Agent Beta" },
            missionCount: 3,
          },
        ],
        missions: [
          {
            id: "m-1",
            title: "Install filter at location X",
            solutionId: "sol-1",
            status: "completed",
            claimedBy: { humanId: "h-1", displayName: "Alice" },
            completedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
        evidence: [
          {
            id: "ev-1",
            missionId: "m-1",
            type: "photo",
            status: "approved",
            submittedBy: "h-1",
          },
        ],
        attestations: [],
        summary: {
          totalParticipants: 3,
          totalCities: 1,
          totalMissionsCompleted: 1,
          totalEvidenceVerified: 1,
        },
      });

      const res = await app.request("/impact/chain/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect((data.problem as Record<string, unknown>).title).toBe("Water Quality Issue");
      expect((data.solutions as unknown[]).length).toBe(1);
      expect((data.missions as unknown[]).length).toBe(1);
      expect((data.summary as Record<string, unknown>).totalParticipants).toBe(3);
    });

    it("returns 400 VALIDATION_ERROR for invalid UUID", async () => {
      const res = await app.request("/impact/chain/not-a-uuid");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 NOT_FOUND for non-existent problem", async () => {
      mockGetChain.mockRejectedValueOnce(new Error("Problem not found"));

      const res = await app.request("/impact/chain/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns empty chain for problem with no solutions", async () => {
      mockGetChain.mockResolvedValueOnce({
        problem: {
          id: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          title: "New Problem",
          domain: "clean_water",
          city: null,
          reportedBy: { type: "agent", id: "a-1", name: "Agent Alpha" },
          createdAt: "2026-02-15T00:00:00.000Z",
        },
        solutions: [],
        missions: [],
        evidence: [],
        attestations: [],
        summary: {
          totalParticipants: 0,
          totalCities: 0,
          totalMissionsCompleted: 0,
          totalEvidenceVerified: 0,
        },
      });

      const res = await app.request("/impact/chain/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Record<string, unknown>;
      expect((data.solutions as unknown[]).length).toBe(0);
      expect((data.summary as Record<string, unknown>).totalParticipants).toBe(0);
    });
  });

  // ── GET /impact/my-ripple ───────────────────────────────

  describe("GET /impact/my-ripple — Personal ripple (authenticated)", () => {
    it("returns aggregated ripple effect summary", async () => {
      mockGetMyRipple.mockResolvedValueOnce({
        contributionsCount: { observations: 5, missions: 12, evidenceReviewed: 8 },
        downstreamMissions: 24,
        peopleInvolved: 18,
        citiesReached: 3,
        domainsImpacted: ["clean_water", "healthcare", "education_access"],
        topChain: {
          problemId: "p-1",
          problemTitle: "Water Quality Issue",
          totalParticipants: 15,
        },
        recentChains: [
          { problemId: "p-1", problemTitle: "Water Quality Issue", myRole: "mission_completer" },
          { problemId: "p-2", problemTitle: "Food Access Gap", myRole: "evidence_reviewer" },
        ],
      });

      const res = await app.request("/impact/my-ripple");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.downstreamMissions).toBe(24);
      expect(data.peopleInvolved).toBe(18);
      expect(data.citiesReached).toBe(3);
      expect((data.domainsImpacted as string[]).length).toBe(3);
    });

    it("returns zero-state for new participant with no contributions", async () => {
      mockGetMyRipple.mockResolvedValueOnce({
        contributionsCount: { observations: 0, missions: 0, evidenceReviewed: 0 },
        downstreamMissions: 0,
        peopleInvolved: 0,
        citiesReached: 0,
        domainsImpacted: [],
        topChain: null,
        recentChains: [],
      });

      const res = await app.request("/impact/my-ripple");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Record<string, unknown>;
      expect(data.downstreamMissions).toBe(0);
      expect(data.topChain).toBeNull();
    });
  });
});
