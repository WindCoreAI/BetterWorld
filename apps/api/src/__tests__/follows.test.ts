/**
 * Follow Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests all 6 follow endpoints: follow, unfollow, following list,
 * followers list, status check, and public counts.
 * Covers self-follow prevention, 200 follow limit, duplicate prevention,
 * cursor pagination, and standard API envelope format.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockFollow = vi.fn();
const mockUnfollow = vi.fn();
const mockGetFollowing = vi.fn();
const mockGetFollowers = vi.fn();
const mockGetStatus = vi.fn();
const mockGetCounts = vi.fn();

vi.mock("../../src/services/follow.service.js", () => {
  class MockFollowError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "FollowError";
    }
  }
  return {
    FollowService: vi.fn().mockImplementation(() => ({
      follow: mockFollow,
      unfollow: mockUnfollow,
      getFollowing: mockGetFollowing,
      getFollowers: mockGetFollowers,
      getStatus: mockGetStatus,
      getCounts: mockGetCounts,
    })),
    FollowError: MockFollowError,
  };
});

vi.mock("../../src/services/notification.service.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: "notif-1", aggregated: false }),
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
  meta?: { hasMore: boolean; nextCursor: string | null; count: number };
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Tests ───────────────────────────────────────────────────

describe("Follow Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const followRoutes = (await import("../routes/follows.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/follows", followRoutes);
  });

  // ── POST /follows/:humanId ──────────────────────────────

  describe("POST /follows/:humanId — Follow a user", () => {
    it("returns 201 with follow data on success", async () => {
      const now = new Date();
      mockFollow.mockResolvedValueOnce({
        id: "follow-1",
        followingHumanId: "target-456",
        createdAt: now,
      });

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveProperty("id", "follow-1");
    });

    it("returns 400 VALIDATION_ERROR for invalid UUID", async () => {
      const res = await app.request("/follows/not-a-uuid", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 SELF_FOLLOW when following yourself", async () => {
      const { FollowError } = await import("../services/follow.service.js");
      mockFollow.mockRejectedValueOnce(new FollowError("SELF_FOLLOW", "Cannot follow yourself"));

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("SELF_FOLLOW");
    });

    it("returns 409 ALREADY_FOLLOWING for duplicate follow", async () => {
      const { FollowError } = await import("../services/follow.service.js");
      mockFollow.mockRejectedValueOnce(new FollowError("ALREADY_FOLLOWING", "Already following"));

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("ALREADY_FOLLOWING");
    });

    it("returns 429 FOLLOW_LIMIT_REACHED when at 200 follows", async () => {
      const { FollowError } = await import("../services/follow.service.js");
      mockFollow.mockRejectedValueOnce(new FollowError("FOLLOW_LIMIT_REACHED", "Already following 200 users"));

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FOLLOW_LIMIT_REACHED");
    });

    it("returns 404 NOT_FOUND for non-existent target", async () => {
      const { FollowError } = await import("../services/follow.service.js");
      mockFollow.mockRejectedValueOnce(new FollowError("NOT_FOUND", "Target does not exist"));

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /follows/:humanId ────────────────────────────

  describe("DELETE /follows/:humanId — Unfollow a user", () => {
    it("returns 200 with unfollowed confirmation", async () => {
      mockUnfollow.mockResolvedValueOnce(true);

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ unfollowed: boolean }>;
      expect(body.ok).toBe(true);
      expect(body.data.unfollowed).toBe(true);
    });

    it("returns 404 NOT_FOUND if not following", async () => {
      const { FollowError } = await import("../services/follow.service.js");
      mockUnfollow.mockRejectedValueOnce(new FollowError("NOT_FOUND", "Not following this user"));

      const res = await app.request("/follows/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  // ── GET /follows/following ──────────────────────────────

  describe("GET /follows/following — List following", () => {
    it("returns paginated following list", async () => {
      mockGetFollowing.mockResolvedValueOnce({
        items: [
          { humanId: "h-1", displayName: "Alice", avatarUrl: null, tier: "newcomer", city: "Portland", followedAt: new Date() },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const res = await app.request("/follows/following");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.meta?.count).toBe(1);
      expect(body.meta?.hasMore).toBe(false);
    });

    it("passes cursor parameter to service", async () => {
      mockGetFollowing.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
      });

      await app.request("/follows/following?cursor=2026-01-01T00%3A00%3A00.000Z%3A%3Afollow-1&limit=5");

      expect(mockGetFollowing).toHaveBeenCalledWith("user-123", expect.objectContaining({
        limit: 5,
      }));
    });
  });

  // ── GET /follows/followers ──────────────────────────────

  describe("GET /follows/followers — List followers", () => {
    it("returns paginated followers list", async () => {
      mockGetFollowers.mockResolvedValueOnce({
        items: [
          {
            humanId: "h-2",
            displayName: "Bob",
            avatarUrl: null,
            tier: "contributor",
            city: "Chicago",
            followedAt: new Date(),
            isFollowingBack: true,
          },
        ],
        hasMore: true,
        nextCursor: "2026-01-01T00:00:00.000Z::follow-2",
      });

      const res = await app.request("/follows/followers");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.meta?.hasMore).toBe(true);
      expect(body.meta?.nextCursor).toBeTruthy();
    });
  });

  // ── GET /follows/status/:humanId ────────────────────────

  describe("GET /follows/status/:humanId — Follow status", () => {
    it("returns follow status between users", async () => {
      const now = new Date();
      mockGetStatus.mockResolvedValueOnce({
        isFollowing: true,
        isFollowedBy: false,
        followingSince: now,
      });

      const res = await app.request("/follows/status/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ isFollowing: boolean; isFollowedBy: boolean; followingSince: string | null }>;
      expect(body.data.isFollowing).toBe(true);
      expect(body.data.isFollowedBy).toBe(false);
      expect(body.data.followingSince).toBeTruthy();
    });

    it("returns null followingSince when not following", async () => {
      mockGetStatus.mockResolvedValueOnce({
        isFollowing: false,
        isFollowedBy: false,
        followingSince: null,
      });

      const res = await app.request("/follows/status/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).followingSince).toBeNull();
    });
  });

  // ── GET /follows/counts/:humanId ────────────────────────

  describe("GET /follows/counts/:humanId — Public follow counts", () => {
    it("returns follower and following counts (no auth required)", async () => {
      mockGetCounts.mockResolvedValueOnce({
        followersCount: 42,
        followingCount: 15,
      });

      const res = await app.request("/follows/counts/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ followersCount: number; followingCount: number }>;
      expect(body.ok).toBe(true);
      expect(body.data.followersCount).toBe(42);
      expect(body.data.followingCount).toBe(15);
    });
  });
});
