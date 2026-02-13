import { Hono } from "hono";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { AppEnv } from "../../app.js";

// ── Mock modules ─────────────────────────────────────────────

const mockGetDb = vi.fn();
const mockGetRedis = vi.fn();
vi.mock("../../lib/container.js", () => ({
  getDb: () => mockGetDb(),
  getRedis: () => mockGetRedis(),
}));

const mockFindClusters = vi.fn();
vi.mock("../../services/pattern-aggregation.js", () => ({
  findClusters: (...args: unknown[]) => mockFindClusters(...args),
}));

vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock requireAdmin middleware to just pass through
vi.mock("../../middleware/auth.js", () => ({
  requireAdmin: () =>
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", { id: "admin-1", email: "admin@test.com", displayName: "Admin", role: "admin" });
      await next();
    },
}));

// ── Helpers ──────────────────────────────────────────────────

async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}

// ── Test setup ───────────────────────────────────────────────

describe("Pattern Routes", () => {
  let app: Hono<AppEnv>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Build a mock DB for route handlers
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "cluster-1" }]),
        }),
      }),
    };

    mockGetDb.mockReturnValue(mockDb);
    mockGetRedis.mockReturnValue(null);

    // Create fresh Hono app per test with error handler
    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("requestId", "test-req-id");
      await next();
    });

    // Import and mount routes dynamically
    const { default: patternRoutes } = await import("../pattern.routes.js");
    app.route("/patterns", patternRoutes);

    // Error handler for AppError
    app.onError((err, c) => {
      const code = (err as { code?: string }).code ?? "INTERNAL_ERROR";
      const status = code === "NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" ? 422 : code === "SERVICE_UNAVAILABLE" ? 503 : 500;
      return c.json({ ok: false, error: { code, message: err.message } }, status as 404);
    });
  });

  describe("GET /patterns", () => {
    it("returns cluster list with pagination", async () => {
      const mockClusters = [
        {
          id: "c1",
          title: "Pothole cluster",
          domain: "environmental_protection",
          city: "chicago",
          memberCount: 6,
          isSystemic: true,
          isActive: true,
          createdAt: new Date("2026-01-15"),
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockClusters),
            }),
          }),
        }),
      });

      const res = await app.request("/patterns");
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as { ok: boolean; data: unknown[]; meta: { hasMore: boolean } };
      expect(body.ok).toBe(true);
      expect(body.meta.hasMore).toBe(false);
    });

    it("filters by domain and city", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const res = await app.request("/patterns?domain=environmental_protection&city=chicago");
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as { ok: boolean; data: unknown[] };
      expect(body.ok).toBe(true);
    });

    it("filters by systemic flag", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const res = await app.request("/patterns?systemic=true");
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as { ok: boolean; data: unknown[] };
      expect(body.ok).toBe(true);
    });
  });

  describe("GET /patterns/:id", () => {
    it("returns cluster detail with member problems", async () => {
      const mockCluster = {
        id: "aaaabbbb-cccc-4ddd-8eee-ffffffffffff",
        title: "Pothole cluster near Main St",
        domain: "environmental_protection",
        city: "chicago",
        memberCount: 5,
        memberProblemIds: ["p1", "p2", "p3", "p4", "p5"],
        isSystemic: true,
      };

      const mockProblems = [
        { id: "p1", title: "Pothole 1", domain: "environmental_protection" },
        { id: "p2", title: "Pothole 2", domain: "environmental_protection" },
      ];

      // First select: cluster lookup
      const clusterSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCluster]),
          }),
        }),
      });

      // Second select: member problems
      const problemsSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockProblems),
        }),
      });

      mockDb.select = vi.fn()
        .mockReturnValueOnce(clusterSelect())
        .mockReturnValueOnce(problemsSelect());

      const res = await app.request(`/patterns/${mockCluster.id}`);
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as { ok: boolean; data: { memberProblems: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.data.memberProblems).toHaveLength(2);
    });

    it("returns 404 for non-existent cluster", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await app.request("/patterns/aaaabbbb-cccc-4ddd-8eee-ffffffffffff");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /patterns/admin/refresh", () => {
    it("triggers re-clustering and returns summary", async () => {
      mockFindClusters.mockResolvedValue([
        { id: "c1", isSystemic: true },
        { id: "c2", isSystemic: false },
      ]);

      const res = await app.request("/patterns/admin/refresh", {
        method: "POST",
      });
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as { ok: boolean; data: { totalClusters: number; totalSystemic: number } };
      expect(body.ok).toBe(true);
      expect(body.data.totalClusters).toBeGreaterThanOrEqual(0);
    });
  });
});
