/**
 * Care Moments Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests 2 care moment endpoints: cheer and celebrate.
 * Covers self-cheer/celebrate prevention, token gift double-entry accounting,
 * insufficient balance handling, and Zod validation.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockSendCheer = vi.fn();
const mockSendCelebrate = vi.fn();

vi.mock("../../src/services/care-moment.service.js", () => {
  class MockCareMomentError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "CareMomentError";
    }
  }
  return {
    CareMomentService: vi.fn().mockImplementation(() => ({
      sendCheer: mockSendCheer,
      sendCelebrate: mockSendCelebrate,
    })),
    CareMomentError: MockCareMomentError,
  };
});

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

describe("Care Moments Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const careMomentRoutes = (await import("../routes/care-moments.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/care", careMomentRoutes);
  });

  // ── POST /care/cheer ────────────────────────────────────

  describe("POST /care/cheer — Send cheer", () => {
    it("returns 201 with cheer data (no gift)", async () => {
      mockSendCheer.mockResolvedValueOnce({
        cheerId: "notif-1",
        targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
        giftSent: false,
        transactionId: null,
      });

      const res = await app.request("/care/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          includeGift: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).giftSent).toBe(false);
      expect((body.data as Record<string, unknown>).transactionId).toBeNull();
    });

    it("returns 201 with cheer and 1-token gift", async () => {
      mockSendCheer.mockResolvedValueOnce({
        cheerId: "notif-2",
        targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
        giftSent: true,
        transactionId: "tx-1",
      });

      const res = await app.request("/care/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          includeGift: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).giftSent).toBe(true);
      expect((body.data as Record<string, unknown>).transactionId).toBe("tx-1");
    });

    it("returns 400 SELF_CHEER when cheering yourself", async () => {
      const { CareMomentError } = await import("../services/care-moment.service.js");
      mockSendCheer.mockRejectedValueOnce(
        new CareMomentError("SELF_CHEER", "Cannot cheer yourself"),
      );

      const res = await app.request("/care/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("SELF_CHEER");
    });

    it("returns 400 INSUFFICIENT_BALANCE when gift attempted with no tokens", async () => {
      const { CareMomentError } = await import("../services/care-moment.service.js");
      mockSendCheer.mockRejectedValueOnce(
        new CareMomentError("INSUFFICIENT_BALANCE", "Not enough tokens for gift"),
      );

      const res = await app.request("/care/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          includeGift: true,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("INSUFFICIENT_BALANCE");
    });

    it("returns 400 VALIDATION_ERROR for invalid targetHumanId", async () => {
      const res = await app.request("/care/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "not-a-uuid",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 NOT_FOUND for non-existent target", async () => {
      const { CareMomentError } = await import("../services/care-moment.service.js");
      mockSendCheer.mockRejectedValueOnce(
        new CareMomentError("NOT_FOUND", "Target human not found"),
      );

      const res = await app.request("/care/cheer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /care/celebrate ────────────────────────────────

  describe("POST /care/celebrate — Send celebration", () => {
    it("returns 201 with celebration data", async () => {
      mockSendCelebrate.mockResolvedValueOnce({
        celebrationId: "notif-3",
        targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
        milestoneType: "tier_promotion",
        giftSent: true,
        transactionId: "tx-2",
      });

      const res = await app.request("/care/celebrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          milestoneType: "tier_promotion",
          includeGift: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).milestoneType).toBe("tier_promotion");
    });

    it("returns 400 VALIDATION_ERROR for missing milestoneType", async () => {
      const res = await app.request("/care/celebrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          includeGift: false,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 VALIDATION_ERROR for invalid milestoneType", async () => {
      const res = await app.request("/care/celebrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          milestoneType: "invalid_milestone",
          includeGift: false,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 SELF_CELEBRATE when celebrating yourself", async () => {
      const { CareMomentError } = await import("../services/care-moment.service.js");
      mockSendCelebrate.mockRejectedValueOnce(
        new CareMomentError("SELF_CELEBRATE", "Cannot celebrate yourself"),
      );

      const res = await app.request("/care/celebrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHumanId: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
          milestoneType: "mission_count",
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
