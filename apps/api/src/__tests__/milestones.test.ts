/**
 * Milestones Routes API Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests GET /milestones — List milestones for a group (domain or city).
 * Covers: valid queries, filtering by status (reached/unreached/all),
 * validation errors, and standard API envelope format.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@betterworld/db", () => ({
  groupMilestones: {
    id: "id",
    groupType: "groupType",
    groupValue: "groupValue",
    milestoneType: "milestoneType",
    targetValue: "targetValue",
    currentValue: "currentValue",
    reachedAt: "reachedAt",
    bannerExpiresAt: "bannerExpiresAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  isNotNull: vi.fn((col) => ({ type: "isNotNull", col })),
  desc: vi.fn((col) => ({ type: "desc", col })),
}));

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => {
    const chain = {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      orderBy: mockOrderBy,
    };
    mockSelect.mockReturnValue(chain);
    mockFrom.mockReturnValue(chain);
    mockWhere.mockReturnValue(chain);
    mockOrderBy.mockResolvedValue([]);
    return chain;
  }),
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

describe("Milestones Routes (Sprint 17)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const milestoneRoutes = (await import("../routes/milestones/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/milestones", milestoneRoutes);
  });

  // ── GET /milestones ───────────────────────────────────────

  describe("GET /milestones — List milestones", () => {
    it("returns 200 with milestones for a domain group", async () => {
      const now = new Date();
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockOrderBy.mockResolvedValueOnce([
        {
          id: "m-1",
          groupType: "domain",
          groupValue: "education_access",
          milestoneType: "missions_completed",
          targetValue: 10,
          currentValue: 10,
          reachedAt: now,
          bannerExpiresAt: future,
        },
        {
          id: "m-2",
          groupType: "domain",
          groupValue: "education_access",
          milestoneType: "members_joined",
          targetValue: 50,
          currentValue: 30,
          reachedAt: null,
          bannerExpiresAt: null,
        },
      ]);

      const res = await app.request("/milestones?groupType=domain&groupValue=education_access");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Array<Record<string, unknown>>;
      expect(data.length).toBe(2);
      expect(data[0]!.id).toBe("m-1");
      expect(data[0]!.reachedAt).toBeTruthy();
      expect(data[0]!.bannerActive).toBe(true);
      expect(data[1]!.reachedAt).toBeNull();
      expect(data[1]!.bannerActive).toBe(false);
    });

    it("returns 200 with milestones for a city group", async () => {
      mockOrderBy.mockResolvedValueOnce([
        {
          id: "m-3",
          groupType: "city",
          groupValue: "portland",
          milestoneType: "problems_submitted",
          targetValue: 100,
          currentValue: 45,
          reachedAt: null,
          bannerExpiresAt: null,
        },
      ]);

      const res = await app.request("/milestones?groupType=city&groupValue=portland");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Array<Record<string, unknown>>;
      expect(data.length).toBe(1);
      expect(data[0]!.groupType).toBe("city");
    });

    it("returns 400 VALIDATION_ERROR for missing groupType", async () => {
      const res = await app.request("/milestones?groupValue=portland");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 VALIDATION_ERROR for missing groupValue", async () => {
      const res = await app.request("/milestones?groupType=domain");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 VALIDATION_ERROR for invalid groupType", async () => {
      const res = await app.request("/milestones?groupType=invalid&groupValue=test");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns empty list for group with no milestones", async () => {
      mockOrderBy.mockResolvedValueOnce([]);

      const res = await app.request("/milestones?groupType=domain&groupValue=no_domain");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.data).toEqual([]);
    });

    it("includes requestId in response envelope", async () => {
      mockOrderBy.mockResolvedValueOnce([]);

      const res = await app.request("/milestones?groupType=domain&groupValue=test");

      const body = (await res.json()) as SuccessBody;
      expect(body.requestId).toBeDefined();
    });
  });
});
