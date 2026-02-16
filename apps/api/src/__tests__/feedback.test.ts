/**
 * Feedback Routes API Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests GET /feedback (list), PATCH /feedback/:id/read (mark as read),
 * GET /feedback/unread-count (unread count badge).
 * Covers: pagination, filtering, ownership check, and standard API envelope.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockListFeedback = vi.fn();
const mockMarkRead = vi.fn();
const mockGetUnreadCount = vi.fn();

vi.mock("../../src/services/feedback.service.js", () => ({
  FeedbackService: vi.fn().mockImplementation(() => ({
    listFeedback: mockListFeedback,
    markRead: mockMarkRead,
    getUnreadCount: mockGetUnreadCount,
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
  meta?: { hasMore: boolean; nextCursor: string | null; unreadCount: number };
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Tests ───────────────────────────────────────────────────

describe("Feedback Routes (Sprint 17)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const feedbackRoutes = (await import("../routes/feedback/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/feedback", feedbackRoutes);
  });

  // ── GET /feedback/unread-count ────────────────────────────

  describe("GET /feedback/unread-count — Unread feedback count", () => {
    it("returns 200 with unread count", async () => {
      mockGetUnreadCount.mockResolvedValueOnce(5);

      const res = await app.request("/feedback/unread-count");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ unreadCount: number }>;
      expect(body.ok).toBe(true);
      expect(body.data.unreadCount).toBe(5);
    });

    it("returns 0 when no unread feedback", async () => {
      mockGetUnreadCount.mockResolvedValueOnce(0);

      const res = await app.request("/feedback/unread-count");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ unreadCount: number }>;
      expect(body.data.unreadCount).toBe(0);
    });

    it("calls service with authenticated user ID", async () => {
      mockGetUnreadCount.mockResolvedValueOnce(0);

      await app.request("/feedback/unread-count");

      expect(mockGetUnreadCount).toHaveBeenCalledWith("user-123", true);
    });
  });

  // ── GET /feedback ─────────────────────────────────────────

  describe("GET /feedback — List feedback (cursor-paginated)", () => {
    it("returns 200 with feedback items and meta", async () => {
      mockListFeedback.mockResolvedValueOnce({
        items: [
          {
            id: "fb-1",
            feedbackType: "high_performer_recognition",
            message: "Excellent work!",
            improvementTips: [],
            referenceId: "ev-1",
            referenceType: "evidence",
            isRead: false,
            createdAt: "2026-02-15T10:00:00.000Z",
          },
        ],
        hasMore: false,
        nextCursor: null,
        unreadCount: 1,
      });

      const res = await app.request("/feedback");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta?.hasMore).toBe(false);
      expect(body.meta?.unreadCount).toBe(1);
    });

    it("passes unreadOnly filter to service", async () => {
      mockListFeedback.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
        unreadCount: 0,
      });

      await app.request("/feedback?unreadOnly=true");

      expect(mockListFeedback).toHaveBeenCalledWith(
        "user-123",
        true,
        expect.objectContaining({ unreadOnly: true }),
      );
    });

    it("passes cursor and limit to service", async () => {
      mockListFeedback.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
        unreadCount: 0,
      });

      await app.request("/feedback?cursor=2026-02-15T10%3A00%3A00.000Z%3A%3Afb-1&limit=5");

      expect(mockListFeedback).toHaveBeenCalledWith(
        "user-123",
        true,
        expect.objectContaining({ limit: 5 }),
      );
    });

    it("returns paginated results with nextCursor", async () => {
      mockListFeedback.mockResolvedValueOnce({
        items: [
          {
            id: "fb-2",
            feedbackType: "evidence_rejection",
            message: "Submission rejected",
            improvementTips: [{ tip: "Improve evidence quality", category: "evidence" }],
            referenceId: "ev-2",
            referenceType: "evidence",
            isRead: false,
            createdAt: "2026-02-14T10:00:00.000Z",
          },
        ],
        hasMore: true,
        nextCursor: "2026-02-14T10:00:00.000Z::fb-2",
        unreadCount: 3,
      });

      const res = await app.request("/feedback?limit=1");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.meta?.hasMore).toBe(true);
      expect(body.meta?.nextCursor).toBe("2026-02-14T10:00:00.000Z::fb-2");
    });

    it("returns empty list when no feedback", async () => {
      mockListFeedback.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
        unreadCount: 0,
      });

      const res = await app.request("/feedback");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.data).toEqual([]);
    });
  });

  // ── PATCH /feedback/:id/read ──────────────────────────────

  describe("PATCH /feedback/:id/read — Mark feedback as read", () => {
    it("returns 200 with updated feedback", async () => {
      mockMarkRead.mockResolvedValueOnce({
        id: "fb-1",
        isRead: true,
        readAt: "2026-02-16T10:00:00.000Z",
      });

      const res = await app.request("/feedback/fb-1/read", {
        method: "PATCH",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ id: string; isRead: boolean; readAt: string }>;
      expect(body.ok).toBe(true);
      expect(body.data.isRead).toBe(true);
      expect(body.data.readAt).toBeTruthy();
    });

    it("returns 404 FEEDBACK_NOT_FOUND for non-existent feedback", async () => {
      mockMarkRead.mockResolvedValueOnce(null);

      const res = await app.request("/feedback/nonexistent/read", {
        method: "PATCH",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FEEDBACK_NOT_FOUND");
    });

    it("returns 404 when feedback belongs to another user", async () => {
      mockMarkRead.mockResolvedValueOnce(null);

      const res = await app.request("/feedback/fb-other-user/read", {
        method: "PATCH",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FEEDBACK_NOT_FOUND");
    });

    it("calls service with correct args", async () => {
      mockMarkRead.mockResolvedValueOnce({
        id: "fb-42",
        isRead: true,
        readAt: "2026-02-16T10:00:00.000Z",
      });

      await app.request("/feedback/fb-42/read", { method: "PATCH" });

      expect(mockMarkRead).toHaveBeenCalledWith("fb-42", "user-123", true);
    });
  });
});
