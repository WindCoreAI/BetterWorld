/**
 * Network Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests 2 network endpoints: personal network summary, interaction history.
 * Covers aggregation with cache, UUID validation, and partner lookup.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockGetNetworkSummary = vi.fn();
const mockGetInteractionHistory = vi.fn();

vi.mock("../../src/services/network.service.js", () => ({
  NetworkService: vi.fn().mockImplementation(() => ({
    getNetworkSummary: mockGetNetworkSummary,
    getInteractionHistory: mockGetInteractionHistory,
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

describe("Network Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const networkRoutes = (await import("../routes/network.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/network", networkRoutes);
  });

  // ── GET /network/me ─────────────────────────────────────

  describe("GET /network/me — Personal network summary", () => {
    it("returns aggregated network summary", async () => {
      mockGetNetworkSummary.mockResolvedValueOnce({
        followersCount: 25,
        followingCount: 18,
        connectionsCount: 12,
        sharedDomains: ["clean_water", "healthcare"],
        activeCities: ["San Francisco", "New York"],
        recentConnections: [
          { humanId: "h-1", displayName: "Alice", avatarUrl: null, connectedAt: "2026-02-10T00:00:00.000Z" },
        ],
        topInteractionPartners: [
          { humanId: "h-2", displayName: "Bob", interactionCount: 15, tier: "advocate" },
        ],
      });

      const res = await app.request("/network/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.followersCount).toBe(25);
      expect(data.followingCount).toBe(18);
      expect(data.connectionsCount).toBe(12);
      expect((data.sharedDomains as string[]).length).toBe(2);
      expect((data.activeCities as string[]).length).toBe(2);
    });

    it("returns empty network for new users", async () => {
      mockGetNetworkSummary.mockResolvedValueOnce({
        followersCount: 0,
        followingCount: 0,
        connectionsCount: 0,
        sharedDomains: [],
        activeCities: [],
        recentConnections: [],
        topInteractionPartners: [],
      });

      const res = await app.request("/network/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Record<string, unknown>;
      expect(data.followersCount).toBe(0);
      expect(data.connectionsCount).toBe(0);
    });
  });

  // ── GET /network/me/interactions ────────────────────────

  describe("GET /network/me/interactions — Interaction history", () => {
    it("returns interaction history with a partner", async () => {
      mockGetInteractionHistory.mockResolvedValueOnce({
        partner: { humanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890", displayName: "Bob" },
        peerReviews: [
          { id: "pr-1", direction: "given", verdict: "approve", createdAt: "2026-02-01T00:00:00.000Z" },
        ],
        endorsements: [
          { id: "end-1", direction: "received", domain: "clean_water", createdAt: "2026-02-05T00:00:00.000Z" },
        ],
        connectionStatus: "accepted",
        isFollowing: true,
      });

      const res = await app.request("/network/me/interactions?partnerId=b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.connectionStatus).toBe("accepted");
      expect((data.peerReviews as unknown[]).length).toBe(1);
    });

    it("returns 400 VALIDATION_ERROR for missing partnerId", async () => {
      const res = await app.request("/network/me/interactions");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 VALIDATION_ERROR for invalid partnerId format", async () => {
      const res = await app.request("/network/me/interactions?partnerId=not-a-uuid");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 NOT_FOUND for non-existent partner", async () => {
      mockGetInteractionHistory.mockRejectedValueOnce(new Error("Partner not found"));

      const res = await app.request("/network/me/interactions?partnerId=b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});
