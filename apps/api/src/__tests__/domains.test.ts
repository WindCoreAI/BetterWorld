/**
 * Domain Community Routes API Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests GET /domains (list all 15 domains) and GET /domains/:slug (domain detail).
 * Covers: success responses, 404 for invalid slug, zero-state domain,
 * and standard API envelope format.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockListDomains = vi.fn();
const mockGetDomainDetail = vi.fn();

vi.mock("../../src/services/domain-community.service.js", () => ({
  DomainCommunityService: vi.fn().mockImplementation(() => ({
    listDomains: mockListDomains,
    getDomainDetail: mockGetDomainDetail,
  })),
}));

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({})),
  getRedis: vi.fn(() => null),
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

describe("Domain Community Routes (Sprint 17)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const domainRoutes = (await import("../routes/domains/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/domains", domainRoutes);
  });

  // ── GET /domains ──────────────────────────────────────────

  describe("GET /domains — List all domains", () => {
    it("returns 200 with list of domains", async () => {
      const domains = [
        {
          slug: "poverty_reduction",
          displayName: "Poverty Reduction",
          memberCount: 42,
          missionsCompleted: 10,
          problemsResolved: 5,
          activeMilestone: { type: "missions_completed", target: 50, current: 10 },
        },
        {
          slug: "education_access",
          displayName: "Education Access",
          memberCount: 38,
          missionsCompleted: 8,
          problemsResolved: 3,
          activeMilestone: null,
        },
      ];
      mockListDomains.mockResolvedValueOnce(domains);

      const res = await app.request("/domains");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect((body.data as unknown[]).length).toBe(2);
    });

    it("returns empty array when no domains have data", async () => {
      mockListDomains.mockResolvedValueOnce([]);

      const res = await app.request("/domains");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([]);
    });

    it("includes requestId in response envelope", async () => {
      mockListDomains.mockResolvedValueOnce([]);

      const res = await app.request("/domains");

      const body = (await res.json()) as SuccessBody;
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe("string");
    });
  });

  // ── GET /domains/:slug ────────────────────────────────────

  describe("GET /domains/:slug — Domain community detail", () => {
    it("returns 200 with full domain detail", async () => {
      const detail = {
        slug: "clean_water",
        displayName: "Clean Water",
        metrics: {
          memberCount: 20,
          missionsCompleted: 5,
          problemsResolved: 3,
          activeMissions: 2,
          totalSolutions: 7,
        },
        topContributors: [
          {
            id: "h-1",
            displayName: "Alice",
            avatarUrl: null,
            tier: "contributor",
            reputationScore: 450,
            type: "human",
          },
        ],
        monthlyHighlights: {
          month: "2026-02",
          missionsCompletedThisMonth: 2,
          problemsResolvedThisMonth: 1,
          newMembersThisMonth: 3,
          topPattern: null,
        },
        recentMilestones: [
          {
            id: "m-1",
            milestoneType: "missions_completed",
            targetValue: 5,
            currentValue: 5,
            reachedAt: "2026-02-10T00:00:00.000Z",
            bannerExpiresAt: "2026-02-17T00:00:00.000Z",
          },
        ],
        activeMilestones: [],
      };
      mockGetDomainDetail.mockResolvedValueOnce(detail);

      const res = await app.request("/domains/clean_water");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).slug).toBe("clean_water");
      expect((body.data as Record<string, unknown>).displayName).toBe("Clean Water");
    });

    it("returns 404 DOMAIN_NOT_FOUND for invalid slug", async () => {
      mockGetDomainDetail.mockResolvedValueOnce(null);

      const res = await app.request("/domains/nonexistent_domain");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DOMAIN_NOT_FOUND");
      expect(body.error.message).toContain("nonexistent_domain");
    });

    it("passes contributorLimit query param to service", async () => {
      mockGetDomainDetail.mockResolvedValueOnce({
        slug: "education_access",
        displayName: "Education Access",
        metrics: {},
        topContributors: [],
        monthlyHighlights: {},
        recentMilestones: [],
        activeMilestones: [],
      });

      await app.request("/domains/education_access?contributorLimit=25");

      expect(mockGetDomainDetail).toHaveBeenCalledWith("education_access", 25);
    });

    it("uses default contributorLimit of 10 when not specified", async () => {
      mockGetDomainDetail.mockResolvedValueOnce({
        slug: "health_wellness",
        displayName: "Health & Wellness",
        metrics: {},
        topContributors: [],
        monthlyHighlights: {},
        recentMilestones: [],
        activeMilestones: [],
      });

      await app.request("/domains/health_wellness");

      expect(mockGetDomainDetail).toHaveBeenCalledWith("health_wellness", 10);
    });

    it("returns zero-state domain with empty metrics", async () => {
      const detail = {
        slug: "sustainable_energy",
        displayName: "Sustainable Energy",
        metrics: {
          memberCount: 0,
          missionsCompleted: 0,
          problemsResolved: 0,
          activeMissions: 0,
          totalSolutions: 0,
        },
        topContributors: [],
        monthlyHighlights: {
          month: "2026-02",
          missionsCompletedThisMonth: 0,
          problemsResolvedThisMonth: 0,
          newMembersThisMonth: 0,
          topPattern: null,
        },
        recentMilestones: [],
        activeMilestones: [],
      };
      mockGetDomainDetail.mockResolvedValueOnce(detail);

      const res = await app.request("/domains/sustainable_energy");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Record<string, unknown>;
      const metrics = data.metrics as Record<string, number>;
      expect(metrics.memberCount).toBe(0);
      expect(metrics.missionsCompleted).toBe(0);
    });
  });
});
