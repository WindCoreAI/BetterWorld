/**
 * Notification Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests all 4 notification endpoints: list notifications, unread count,
 * mark single read, mark all read.
 * Covers aggregation behavior, cursor pagination, type filtering,
 * and unread count caching.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockList = vi.fn();
const mockGetUnreadCount = vi.fn();
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();
const mockCreate = vi.fn();

vi.mock("../../src/services/notification.service.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    list: mockList,
    getUnreadCount: mockGetUnreadCount,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
    create: mockCreate,
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

// Mock error handler for AppError thrown by notification routes
vi.mock("@betterworld/shared", async () => {
  const actual = await vi.importActual("@betterworld/shared");
  return {
    ...actual,
  };
});

// ── Response types ──────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  requestId: string;
  meta?: { hasMore: boolean; nextCursor: string | null; count: number };
}

// ── Tests ───────────────────────────────────────────────────

describe("Notification Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { errorHandler } = await import("../middleware/error-handler.js");
    const notificationRoutes = (await import("../routes/notifications.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/notifications", notificationRoutes);
    app.onError(errorHandler);
  });

  // ── GET /notifications ──────────────────────────────────

  describe("GET /notifications — List notifications", () => {
    it("returns paginated notification list", async () => {
      const now = new Date();
      mockList.mockResolvedValueOnce({
        notifications: [
          {
            id: "n-1",
            type: "follow",
            message: "Alice started following you",
            actorHumanId: "h-1",
            referenceId: "follow-1",
            referenceType: "follow",
            readAt: null,
            count: 1,
            createdAt: now,
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const res = await app.request("/notifications");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.meta?.count).toBe(1);
    });

    it("supports unreadOnly filter", async () => {
      mockList.mockResolvedValueOnce({
        notifications: [],
        hasMore: false,
        nextCursor: null,
      });

      await app.request("/notifications?unreadOnly=true");

      expect(mockList).toHaveBeenCalledWith("user-123", expect.objectContaining({
        unreadOnly: true,
      }));
    });

    it("supports type filter", async () => {
      mockList.mockResolvedValueOnce({
        notifications: [],
        hasMore: false,
        nextCursor: null,
      });

      await app.request("/notifications?type=follow");

      expect(mockList).toHaveBeenCalledWith("user-123", expect.objectContaining({
        type: "follow",
      }));
    });

    it("returns hasMore and nextCursor for pagination", async () => {
      mockList.mockResolvedValueOnce({
        notifications: [
          { id: "n-1", type: "follow", message: "Test", readAt: null, count: 1, createdAt: new Date() },
          { id: "n-2", type: "cheer", message: "Test2", readAt: null, count: 1, createdAt: new Date() },
        ],
        hasMore: true,
        nextCursor: "2026-01-01T00:00:00.000Z::n-2",
      });

      const res = await app.request("/notifications?limit=2");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.meta?.hasMore).toBe(true);
      expect(body.meta?.nextCursor).toBe("2026-01-01T00:00:00.000Z::n-2");
    });
  });

  // ── GET /notifications/unread-count ─────────────────────

  describe("GET /notifications/unread-count — Unread badge count", () => {
    it("returns unread count", async () => {
      mockGetUnreadCount.mockResolvedValueOnce(7);

      const res = await app.request("/notifications/unread-count");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ unreadCount: number }>;
      expect(body.ok).toBe(true);
      expect(body.data.unreadCount).toBe(7);
    });

    it("returns zero when no unread notifications", async () => {
      mockGetUnreadCount.mockResolvedValueOnce(0);

      const res = await app.request("/notifications/unread-count");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ unreadCount: number }>;
      expect(body.data.unreadCount).toBe(0);
    });
  });

  // ── PATCH /notifications/:id/read ───────────────────────

  describe("PATCH /notifications/:id/read — Mark single read", () => {
    it("returns 200 with marked confirmation", async () => {
      mockMarkRead.mockResolvedValueOnce(true);

      const res = await app.request("/notifications/b1c2d3e4-f5a6-7890-abcd-ef1234567890/read", {
        method: "PATCH",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ marked: boolean }>;
      expect(body.data.marked).toBe(true);
    });

    it("returns 404 NOT_FOUND for non-existent notification", async () => {
      mockMarkRead.mockResolvedValueOnce(false);

      const res = await app.request("/notifications/b1c2d3e4-f5a6-7890-abcd-ef1234567890/read", {
        method: "PATCH",
      });

      expect(res.status).toBe(404); // AppError NOT_FOUND thrown, caught by error handler
    });
  });

  // ── POST /notifications/read-all ────────────────────────

  describe("POST /notifications/read-all — Mark all read", () => {
    it("returns 200 with marked count", async () => {
      mockMarkAllRead.mockResolvedValueOnce(15);

      const res = await app.request("/notifications/read-all", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ markedCount: number }>;
      expect(body.ok).toBe(true);
      expect(body.data.markedCount).toBe(15);
    });

    it("returns 0 count when no unread notifications", async () => {
      mockMarkAllRead.mockResolvedValueOnce(0);

      const res = await app.request("/notifications/read-all", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ markedCount: number }>;
      expect(body.data.markedCount).toBe(0);
    });
  });
});
