/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Validator Affinity Unit Tests (Sprint 11 — T039)
 *
 * Tests:
 *   1. PATCH with 2 regions → stored correctly
 *   2. PATCH with 4 regions → 422 validation error
 *   3. Empty array clears regions
 *   4. home_region_name/point synced to first region
 *   5. Agent not in pool → 404
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
const mockExecute = vi.fn();

const mockDb = {
  select: mockSelect,
  execute: mockExecute,
};

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });

vi.mock("../../lib/container.js", () => ({
  getDb: vi.fn(() => mockDb),
  getRedis: vi.fn(() => null),
}));

// Mock auth middleware — inject agent context
const MOCK_AGENT = {
  id: "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa",
  username: "test-agent",
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

  const validatorRoutes = (await import("../../routes/validator.routes.js")).default;
  app.route("/validator", validatorRoutes);
});

describe("Validator Affinity (PATCH /validator/affinity)", () => {
  it("should update 2 home regions successfully", async () => {
    // Agent is in validator pool
    mockLimit.mockResolvedValueOnce([{ id: "val-1" }]);
    // Execute PostGIS update
    mockExecute.mockResolvedValueOnce(undefined);

    const body = {
      homeRegions: [
        { name: "Portland, OR", lat: 45.5152, lng: -122.6784 },
        { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
      ],
    };

    const res = await app.request("/validator/affinity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.homeRegions).toHaveLength(2);
    expect(data.data.primaryRegion).toBe("Portland, OR");
  });

  it("should reject 4 regions with 422 validation error", async () => {
    const body = {
      homeRegions: [
        { name: "Portland, OR", lat: 45.5152, lng: -122.6784 },
        { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
        { name: "Denver, CO", lat: 39.7392, lng: -104.9903 },
        { name: "Seattle, WA", lat: 47.6062, lng: -122.3321 },
      ],
    };

    const res = await app.request("/validator/affinity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(422);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("should clear regions with empty array", async () => {
    // Agent is in validator pool
    mockLimit.mockResolvedValueOnce([{ id: "val-1" }]);
    // Execute PostGIS update (clear)
    mockExecute.mockResolvedValueOnce(undefined);

    const body = { homeRegions: [] };

    const res = await app.request("/validator/affinity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.data.homeRegions).toHaveLength(0);
    expect(data.data.primaryRegion).toBeNull();
  });

  it("should return 404 if agent is not in validator pool", async () => {
    mockLimit.mockResolvedValueOnce([]); // no validator found

    const body = {
      homeRegions: [
        { name: "Portland, OR", lat: 45.5152, lng: -122.6784 },
      ],
    };

    const res = await app.request("/validator/affinity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("NOT_FOUND");
  });
});

describe("Validator Stats (GET /validator/stats)", () => {
  it("should return validator stats including home regions", async () => {
    mockLimit.mockResolvedValueOnce([{
      id: "val-1",
      agentId: MOCK_AGENT.id,
      tier: "journeyman",
      f1Score: "0.8900",
      precision: "0.9000",
      recall: "0.8800",
      totalEvaluations: 75,
      correctEvaluations: 67,
      responseRate: "0.9500",
      dailyEvaluationCount: 3,
      homeRegions: [{ name: "Portland, OR", lat: 45.5152, lng: -122.6784 }],
      isActive: true,
      suspendedUntil: null,
    }]);

    const res = await app.request("/validator/stats");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    expect(data.ok).toBe(true);
    expect(data.data.tier).toBe("journeyman");
    expect(data.data.f1Score).toBe(0.89);
    expect(data.data.homeRegions).toHaveLength(1);
    expect(data.data.dailyLimit).toBe(10);
  });

  it("should return 404 if agent not in pool", async () => {
    mockLimit.mockResolvedValueOnce([]); // no validator

    const res = await app.request("/validator/stats");
    expect(res.status).toBe(404);
    const data = (await res.json()) as any;

    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("NOT_FOUND");
  });
});
