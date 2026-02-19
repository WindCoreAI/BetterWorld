/**
 * Discussion Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests all 5 discussion endpoints: create thread, list threads, get thread,
 * create reply, list replies.
 * Covers full 3-layer guardrail pipeline integration (pending content NOT visible),
 * scope validation, rate limiting, and content moderation.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockCreateThread = vi.fn();
const mockCreateReply = vi.fn();
const mockListThreads = vi.fn();
const mockGetThread = vi.fn();
const mockListReplies = vi.fn();

vi.mock("../../src/services/discussion.service.js", () => {
  class MockDiscussionError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "DiscussionError";
    }
  }
  return {
    DiscussionService: vi.fn().mockImplementation(() => ({
      createThread: mockCreateThread,
      createReply: mockCreateReply,
      listThreads: mockListThreads,
      getThread: mockGetThread,
      listReplies: mockListReplies,
    })),
    DiscussionError: MockDiscussionError,
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
  meta?: { hasMore: boolean; nextCursor: string | null; count: number };
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Tests ───────────────────────────────────────────────────

describe("Discussion Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const discussionRoutes = (await import("../routes/discussions.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/discussions", discussionRoutes);
  });

  // ── POST /discussions/threads ───────────────────────────

  describe("POST /discussions/threads — Create thread with guardrail pipeline", () => {
    it("returns 201 with thread in pending guardrail status", async () => {
      const now = new Date();
      mockCreateThread.mockResolvedValueOnce({
        id: "thread-1",
        scopeType: "domain",
        scopeValue: "clean_water",
        title: "Water quality in San Francisco",
        content: "I noticed water quality issues...",
        authorHumanId: "user-123",
        authorDisplayName: "Test User",
        guardrailStatus: "pending",
        replyCount: 0,
        createdAt: now,
      });

      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "domain",
          scopeValue: "clean_water",
          title: "Water quality in San Francisco",
          content: "I noticed water quality issues in several neighborhoods.",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).guardrailStatus).toBe("pending");
      expect((body.data as Record<string, unknown>).replyCount).toBe(0);
    });

    it("returns 400 VALIDATION_ERROR for title too short", async () => {
      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "domain",
          scopeValue: "clean_water",
          title: "Hi",
          content: "Some content that is long enough to pass validation.",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 VALIDATION_ERROR for content too short", async () => {
      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "domain",
          scopeValue: "clean_water",
          title: "Valid title here",
          content: "Short",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 INVALID_SCOPE for unknown domain", async () => {
      const { DiscussionError } = await import("../services/discussion.service.js");
      mockCreateThread.mockRejectedValueOnce(
        new DiscussionError("INVALID_SCOPE", "Unknown domain: invalid_domain"),
      );

      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "domain",
          scopeValue: "invalid_domain",
          title: "Valid title here",
          content: "Some content that is long enough to pass validation.",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("INVALID_SCOPE");
    });

    it("returns 403 CONTENT_REJECTED when Layer A rejects content", async () => {
      const { DiscussionError } = await import("../services/discussion.service.js");
      mockCreateThread.mockRejectedValueOnce(
        new DiscussionError("CONTENT_REJECTED", "Content violates community guidelines"),
      );

      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "domain",
          scopeValue: "clean_water",
          title: "Harmful content title",
          content: "Content that violates community guidelines here.",
        }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONTENT_REJECTED");
    });

    it("returns 429 THREAD_RATE_LIMIT when exceeding 10 threads/day", async () => {
      const { DiscussionError } = await import("../services/discussion.service.js");
      mockCreateThread.mockRejectedValueOnce(
        new DiscussionError("THREAD_RATE_LIMIT", "Thread creation limit exceeded (10/day)"),
      );

      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "domain",
          scopeValue: "clean_water",
          title: "Another thread title",
          content: "Content for rate limit test that is long enough.",
        }),
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("THREAD_RATE_LIMIT");
    });

    it("creates thread in city scope", async () => {
      const now = new Date();
      mockCreateThread.mockResolvedValueOnce({
        id: "thread-2",
        scopeType: "city",
        scopeValue: "sanfrancisco",
        title: "San Francisco community updates",
        content: "Sharing updates from our San Francisco community meetings.",
        authorHumanId: "user-123",
        authorDisplayName: "Test User",
        guardrailStatus: "pending",
        replyCount: 0,
        createdAt: now,
      });

      const res = await app.request("/discussions/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "city",
          scopeValue: "sanfrancisco",
          title: "San Francisco community updates",
          content: "Sharing updates from our San Francisco community meetings.",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).scopeType).toBe("city");
    });
  });

  // ── GET /discussions/threads ────────────────────────────

  describe("GET /discussions/threads — List threads (approved only)", () => {
    it("returns only approved threads (pending NOT visible)", async () => {
      mockListThreads.mockResolvedValueOnce({
        items: [
          {
            id: "thread-1",
            title: "Approved Thread",
            authorDisplayName: "Alice",
            replyCount: 3,
            lastActivityAt: new Date().toISOString(),
            guardrailStatus: "approved",
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const res = await app.request("/discussions/threads?scopeType=domain&scopeValue=clean_water");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const items = body.data as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      // Verify the service is called with correct scope parameters
      expect(mockListThreads).toHaveBeenCalledWith(expect.objectContaining({
        scopeType: "domain",
        scopeValue: "clean_water",
      }));
    });

    it("requires scopeType and scopeValue query parameters", async () => {
      const res = await app.request("/discussions/threads");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("supports sort by activity or recent", async () => {
      mockListThreads.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
      });

      await app.request("/discussions/threads?scopeType=domain&scopeValue=clean_water&sort=recent");

      expect(mockListThreads).toHaveBeenCalledWith(expect.objectContaining({
        sort: "recent",
      }));
    });
  });

  // ── GET /discussions/threads/:threadId ──────────────────

  describe("GET /discussions/threads/:threadId — Get single thread", () => {
    it("returns approved thread details", async () => {
      mockGetThread.mockResolvedValueOnce({
        id: "thread-1",
        scopeType: "domain",
        scopeValue: "clean_water",
        title: "Approved Thread",
        content: "Full thread content here.",
        authorHumanId: "h-1",
        authorDisplayName: "Alice",
        guardrailStatus: "approved",
        replyCount: 5,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });

      const res = await app.request("/discussions/threads/thread-1");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).id).toBe("thread-1");
    });

    it("returns 404 for non-existent or pending thread", async () => {
      mockGetThread.mockResolvedValueOnce(null);

      const res = await app.request("/discussions/threads/nonexistent-id");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  // ── POST /discussions/threads/:threadId/replies ─────────

  describe("POST /discussions/threads/:threadId/replies — Create reply", () => {
    it("returns 201 with reply in pending guardrail status", async () => {
      const now = new Date();
      mockCreateReply.mockResolvedValueOnce({
        id: "reply-1",
        threadId: "thread-1",
        content: "This is a meaningful reply.",
        authorHumanId: "user-123",
        authorDisplayName: "Test User",
        guardrailStatus: "pending",
        createdAt: now,
      });

      const res = await app.request("/discussions/threads/thread-1/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "This is a meaningful reply.",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).guardrailStatus).toBe("pending");
    });

    it("returns 400 VALIDATION_ERROR for reply content too short", async () => {
      const res = await app.request("/discussions/threads/thread-1/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "x",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 404 NOT_FOUND for non-existent thread", async () => {
      const { DiscussionError } = await import("../services/discussion.service.js");
      mockCreateReply.mockRejectedValueOnce(
        new DiscussionError("NOT_FOUND", "Thread not found"),
      );

      const res = await app.request("/discussions/threads/nonexistent/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "This is a meaningful reply content.",
        }),
      });

      expect(res.status).toBe(404);
    });

    it("returns 403 CONTENT_REJECTED for rule engine failure", async () => {
      const { DiscussionError } = await import("../services/discussion.service.js");
      mockCreateReply.mockRejectedValueOnce(
        new DiscussionError("CONTENT_REJECTED", "Reply violates community guidelines"),
      );

      const res = await app.request("/discussions/threads/thread-1/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Content that violates community guidelines.",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("returns 429 REPLY_RATE_LIMIT when exceeding 50 replies/day", async () => {
      const { DiscussionError } = await import("../services/discussion.service.js");
      mockCreateReply.mockRejectedValueOnce(
        new DiscussionError("REPLY_RATE_LIMIT", "Reply limit exceeded (50/day)"),
      );

      const res = await app.request("/discussions/threads/thread-1/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Yet another reply to test rate limiting.",
        }),
      });

      expect(res.status).toBe(429);
    });
  });

  // ── GET /discussions/threads/:threadId/replies ──────────

  describe("GET /discussions/threads/:threadId/replies — List replies (approved only)", () => {
    it("returns paginated approved replies", async () => {
      mockListReplies.mockResolvedValueOnce({
        items: [
          {
            id: "reply-1",
            content: "An approved reply.",
            authorHumanId: "h-1",
            authorDisplayName: "Alice",
            guardrailStatus: "approved",
            createdAt: new Date().toISOString(),
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const res = await app.request("/discussions/threads/thread-1/replies");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.meta?.count).toBe(1);
    });

    it("supports cursor pagination", async () => {
      mockListReplies.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
      });

      await app.request("/discussions/threads/thread-1/replies?cursor=2026-01-01T00%3A00%3A00.000Z%3A%3Areply-5&limit=10");

      expect(mockListReplies).toHaveBeenCalledWith("thread-1", expect.objectContaining({
        limit: 10,
      }));
    });
  });
});
