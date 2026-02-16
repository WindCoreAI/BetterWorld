/**
 * Intelligence Routes API Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests GET /intelligence/latest (latest report) and
 * GET /intelligence/domain/:domain (domain-filtered intelligence).
 * Covers: success, 404 no report, invalid domain, standard API envelope.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockGetLatest = vi.fn();
const mockGetDomainIntelligence = vi.fn();

vi.mock("../../src/services/intelligence.service.js", () => ({
  IntelligenceService: vi.fn().mockImplementation(() => ({
    getLatest: mockGetLatest,
    getDomainIntelligence: mockGetDomainIntelligence,
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

describe("Intelligence Routes (Sprint 17)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const intelligenceRoutes = (await import("../routes/intelligence/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/intelligence", intelligenceRoutes);
  });

  // ── GET /intelligence/latest ──────────────────────────────

  describe("GET /intelligence/latest — Latest intelligence report", () => {
    it("returns 200 with latest report data", async () => {
      mockGetLatest.mockResolvedValueOnce({
        reportMonth: "2026-02",
        generatedAt: new Date("2026-02-16T00:00:00.000Z"),
        data: {
          collectiveProgress: {
            totalMissionsCompleted: 120,
            totalProblemsResolved: 80,
            newParticipantsThisMonth: 15,
            activeParticipants: 65,
            topDomains: ["education_access", "clean_water"],
          },
          domainTrends: [
            {
              domain: "education_access",
              problemsDelta: 5,
              missionsDelta: 3,
              membersDelta: 2,
            },
          ],
          emergingPatterns: ["Increased focus on water quality monitoring"],
          communityHighlights: ["First 100-mission milestone reached"],
        },
      });

      const res = await app.request("/intelligence/latest");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.reportMonth).toBe("2026-02");
      expect(data.collectiveProgress).toBeDefined();
      expect(data.domainTrends).toBeDefined();
    });

    it("returns 404 NO_REPORT_AVAILABLE when no report exists", async () => {
      mockGetLatest.mockResolvedValueOnce(null);

      const res = await app.request("/intelligence/latest");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NO_REPORT_AVAILABLE");
    });

    it("includes requestId in response", async () => {
      mockGetLatest.mockResolvedValueOnce(null);

      const res = await app.request("/intelligence/latest");

      const body = (await res.json()) as ErrorBody;
      expect(body.requestId).toBeDefined();
    });
  });

  // ── GET /intelligence/domain/:domain ──────────────────────

  describe("GET /intelligence/domain/:domain — Domain intelligence", () => {
    it("returns 200 with domain-filtered intelligence", async () => {
      mockGetDomainIntelligence.mockResolvedValueOnce({
        domain: "clean_water_sanitation",
        trend: { problemsDelta: 3, missionsDelta: 2, membersDelta: 1 },
        topPatterns: ["Water quality concerns rising"],
        recentProblems: [{ id: "p-1", title: "Contaminated well" }],
      });

      const res = await app.request("/intelligence/domain/clean_water_sanitation");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.domain).toBe("clean_water_sanitation");
    });

    it("returns 404 DOMAIN_NOT_FOUND for invalid domain", async () => {
      const res = await app.request("/intelligence/domain/nonexistent_domain");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DOMAIN_NOT_FOUND");
      // Service should NOT be called for invalid domains
      expect(mockGetDomainIntelligence).not.toHaveBeenCalled();
    });

    it("returns 404 NO_REPORT_AVAILABLE when no report exists for valid domain", async () => {
      mockGetDomainIntelligence.mockResolvedValueOnce(null);

      const res = await app.request("/intelligence/domain/education_access");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NO_REPORT_AVAILABLE");
    });

    it("calls service with domain slug", async () => {
      mockGetDomainIntelligence.mockResolvedValueOnce({
        domain: "poverty_reduction",
        trend: { problemsDelta: 0, missionsDelta: 0, membersDelta: 0 },
        topPatterns: [],
        recentProblems: [],
      });

      await app.request("/intelligence/domain/poverty_reduction");

      expect(mockGetDomainIntelligence).toHaveBeenCalledWith("poverty_reduction");
    });
  });
});
