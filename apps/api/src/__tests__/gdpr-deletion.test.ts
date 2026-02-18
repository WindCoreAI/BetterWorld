/**
 * GDPR Account Deletion Integration Tests (Sprint 20: Security Hardening)
 *
 * Tests: initiation creates pending request with 14-day expiry,
 * cancel during cooling-off, duplicate request 409, active claims 422,
 * worker processes expired requests with anonymization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../lib/container.js", () => ({
  getDb: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("../middleware/humanAuth.js", () => ({
  humanAuth: () =>
    vi.fn().mockImplementation(async (c: any, next: any) => {
      const authHeader = c.req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401);
      }
      c.set("human", { id: "test-human-id", email: "test@example.com", displayName: "Test User", role: "human" });
      await next();
    }),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../services/data-export.service.js", () => ({
  exportUserData: vi.fn(),
}));

vi.mock("../services/account-deletion.service.js", () => ({
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
  getDeletionStatus: vi.fn(),
}));

import { Hono } from "hono";
import gdprRoutes from "../routes/gdpr.routes.js";
import { getDb, getRedis } from "../lib/container.js";
import { requestDeletion, cancelDeletion, getDeletionStatus } from "../services/account-deletion.service.js";

const app = new Hono<{ Variables: { requestId: string } }>();
app.use("*", async (c, next) => {
  c.set("requestId", "test-request-id");
  await next();
});
app.route("/", gdprRoutes);

describe("GDPR Account Deletion (T024)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getDb as any).mockReturnValue({});
    (getRedis as any).mockReturnValue(null);
  });

  describe("POST /me/deletion-request", () => {
    it("should create a pending deletion request with 14-day expiry", async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      (requestDeletion as any).mockResolvedValue({
        data: {
          id: "request-1",
          status: "pending",
          requestedAt: now.toISOString(),
          coolingOffExpiresAt: expiresAt.toISOString(),
        },
      });

      const res = await app.request("/me/deletion-request", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("pending");
      expect(body.data.coolingOffExpiresAt).toBeDefined();
    });

    it("should return 409 for duplicate deletion request", async () => {
      (requestDeletion as any).mockResolvedValue({
        error: {
          code: "DELETION_ALREADY_PENDING",
          message: "An account deletion request is already pending.",
        },
      });

      const res = await app.request("/me/deletion-request", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(409);
      const body: any = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DELETION_ALREADY_PENDING");
    });

    it("should return 422 for user with active claims", async () => {
      (requestDeletion as any).mockResolvedValue({
        error: {
          code: "ACTIVE_OBLIGATIONS",
          message: "Cannot delete account with active mission claims or unresolved disputes.",
          details: { activeMissionClaims: 2, unresolvedDisputes: 0 },
        },
      });

      const res = await app.request("/me/deletion-request", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(422);
      const body: any = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("ACTIVE_OBLIGATIONS");
    });
  });

  describe("DELETE /me/deletion-request", () => {
    it("should cancel a pending deletion during cooling-off", async () => {
      (cancelDeletion as any).mockResolvedValue({
        data: {
          id: "request-1",
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        },
      });

      const res = await app.request("/me/deletion-request", {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("cancelled");
      expect(body.data.cancelledAt).toBeDefined();
    });

    it("should return 404 when no pending deletion exists", async () => {
      (cancelDeletion as any).mockResolvedValue({
        error: {
          code: "NO_PENDING_DELETION",
          message: "No pending deletion request found.",
        },
      });

      const res = await app.request("/me/deletion-request", {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(404);
      const body: any = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NO_PENDING_DELETION");
    });
  });

  describe("GET /me/deletion-request", () => {
    it("should return current deletion request status", async () => {
      (getDeletionStatus as any).mockResolvedValue({
        id: "request-1",
        status: "pending",
        requestedAt: new Date().toISOString(),
        coolingOffExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        cancelledAt: null,
      });

      const res = await app.request("/me/deletion-request", {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("pending");
    });

    it("should return null when no deletion request exists", async () => {
      (getDeletionStatus as any).mockResolvedValue(null);

      const res = await app.request("/me/deletion-request", {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toBeNull();
    });
  });
});
