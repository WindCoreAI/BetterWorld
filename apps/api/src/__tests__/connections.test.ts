/**
 * Connection Routes API Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests all 8 connection endpoints: send request, accept, decline, remove,
 * list accepted, list pending, suggestions, status.
 * Covers self-connection prevention, 30-day cooldown, auto-accept mutual,
 * cursor pagination, domain filter, and suggestion algorithm.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockSendRequest = vi.fn();
const mockAccept = vi.fn();
const mockDecline = vi.fn();
const mockRemove = vi.fn();
const mockListAccepted = vi.fn();
const mockListPending = vi.fn();
const mockGetSuggestions = vi.fn();
const mockGetStatus = vi.fn();

vi.mock("../../src/services/connection.service.js", () => {
  class MockConnectionError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ConnectionError";
    }
  }
  return {
    ConnectionService: vi.fn().mockImplementation(() => ({
      sendRequest: mockSendRequest,
      accept: mockAccept,
      decline: mockDecline,
      remove: mockRemove,
      listAccepted: mockListAccepted,
      listPending: mockListPending,
      getSuggestions: mockGetSuggestions,
      getStatus: mockGetStatus,
    })),
    ConnectionError: MockConnectionError,
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

describe("Connection Routes (Sprint 16)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const connectionRoutes = (await import("../routes/connections.routes.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/connections", connectionRoutes);
  });

  // ── POST /connections/:humanId ──────────────────────────

  describe("POST /connections/:humanId — Send connection request", () => {
    it("returns 201 with pending connection", async () => {
      const now = new Date();
      mockSendRequest.mockResolvedValueOnce({
        id: "conn-1",
        recipientHumanId: "target-456",
        status: "pending",
        createdAt: now,
      });

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect((body.data as Record<string, unknown>).status).toBe("pending");
    });

    it("returns 201 with accepted status for auto-accept mutual", async () => {
      const now = new Date();
      mockSendRequest.mockResolvedValueOnce({
        id: "conn-1",
        recipientHumanId: "target-456",
        status: "accepted",
        createdAt: now,
        sharedDomains: ["clean_water"],
        interactionCount: 3,
        acceptedAt: now,
      });

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).status).toBe("accepted");
      expect((body.data as Record<string, unknown>).sharedDomains).toEqual(["clean_water"]);
    });

    it("returns 400 VALIDATION_ERROR for invalid UUID", async () => {
      const res = await app.request("/connections/not-a-uuid", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 SELF_CONNECTION when connecting with yourself", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockSendRequest.mockRejectedValueOnce(
        new ConnectionError("SELF_CONNECTION", "Cannot connect with yourself"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("SELF_CONNECTION");
    });

    it("returns 409 ALREADY_CONNECTED for duplicate connection", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockSendRequest.mockRejectedValueOnce(
        new ConnectionError("ALREADY_CONNECTED", "Connection already exists"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("ALREADY_CONNECTED");
    });

    it("returns 429 COOLDOWN_ACTIVE within 30-day decline period", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockSendRequest.mockRejectedValueOnce(
        new ConnectionError("COOLDOWN_ACTIVE", "Previously declined, must wait"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "POST",
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("COOLDOWN_ACTIVE");
    });
  });

  // ── POST /connections/:id/accept ────────────────────────

  describe("POST /connections/:id/accept — Accept request", () => {
    it("returns 200 with accepted connection and shared domains", async () => {
      mockAccept.mockResolvedValueOnce({
        id: "conn-1",
        status: "accepted",
        sharedDomains: ["education_access", "healthcare"],
        interactionCount: 5,
        acceptedAt: new Date(),
        recipientHumanId: "user-123",
      });

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890/accept", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).status).toBe("accepted");
      expect((body.data as Record<string, unknown>).sharedDomains).toEqual(["education_access", "healthcare"]);
      expect((body.data as Record<string, unknown>).interactionCount).toBe(5);
    });

    it("returns 403 NOT_RECIPIENT when non-recipient tries to accept", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockAccept.mockRejectedValueOnce(
        new ConnectionError("NOT_RECIPIENT", "Only the recipient can accept"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890/accept", {
        method: "POST",
      });

      expect(res.status).toBe(403);
    });

    it("returns 409 NOT_PENDING for non-pending request", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockAccept.mockRejectedValueOnce(
        new ConnectionError("NOT_PENDING", "Request is not in pending state"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890/accept", {
        method: "POST",
      });

      expect(res.status).toBe(409);
    });
  });

  // ── POST /connections/:id/decline ───────────────────────

  describe("POST /connections/:id/decline — Decline request", () => {
    it("returns 200 with declined confirmation", async () => {
      mockDecline.mockResolvedValueOnce(true);

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890/decline", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ declined: boolean }>;
      expect(body.data.declined).toBe(true);
    });

    it("returns 403 NOT_RECIPIENT when non-recipient tries to decline", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockDecline.mockRejectedValueOnce(
        new ConnectionError("NOT_RECIPIENT", "Only the recipient can decline"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890/decline", {
        method: "POST",
      });

      expect(res.status).toBe(403);
    });
  });

  // ── DELETE /connections/:id ─────────────────────────────

  describe("DELETE /connections/:id — Remove connection", () => {
    it("returns 200 with removed confirmation", async () => {
      mockRemove.mockResolvedValueOnce(true);

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ removed: boolean }>;
      expect(body.data.removed).toBe(true);
    });

    it("returns 403 NOT_PARTICIPANT when non-participant tries to remove", async () => {
      const { ConnectionError } = await import("../services/connection.service.js");
      mockRemove.mockRejectedValueOnce(
        new ConnectionError("NOT_PARTICIPANT", "Only a participant can remove"),
      );

      const res = await app.request("/connections/b1c2d3e4-f5a6-7890-abcd-ef1234567890", {
        method: "DELETE",
      });

      expect(res.status).toBe(403);
    });
  });

  // ── GET /connections ────────────────────────────────────

  describe("GET /connections — List accepted connections", () => {
    it("returns paginated accepted connections", async () => {
      mockListAccepted.mockResolvedValueOnce({
        items: [
          {
            connectionId: "conn-1",
            humanId: "h-1",
            displayName: "Alice",
            avatarUrl: null,
            tier: "contributor",
            city: "Portland",
            sharedDomains: ["clean_water"],
            interactionCount: 3,
            connectedSince: new Date(),
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const res = await app.request("/connections");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.meta?.count).toBe(1);
    });

    it("supports domain filter", async () => {
      mockListAccepted.mockResolvedValueOnce({
        items: [],
        hasMore: false,
        nextCursor: null,
      });

      await app.request("/connections?domain=clean_water");

      expect(mockListAccepted).toHaveBeenCalledWith("user-123", expect.objectContaining({
        domain: "clean_water",
      }));
    });
  });

  // ── GET /connections/pending ────────────────────────────

  describe("GET /connections/pending — List pending requests", () => {
    it("returns pending requests received", async () => {
      mockListPending.mockResolvedValueOnce({
        items: [
          {
            connectionId: "conn-2",
            requesterHumanId: "h-2",
            requesterDisplayName: "Bob",
            requesterAvatarUrl: null,
            requesterTier: "newcomer",
            sharedDomains: [],
            requestedAt: new Date(),
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const res = await app.request("/connections/pending");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.meta?.count).toBe(1);
    });
  });

  // ── GET /connections/suggestions ────────────────────────

  describe("GET /connections/suggestions — Connection suggestions", () => {
    it("returns up to 5 suggestions with scores and reasons", async () => {
      mockGetSuggestions.mockResolvedValueOnce([
        {
          humanId: "h-3",
          displayName: "Carol",
          avatarUrl: null,
          tier: "advocate",
          city: "Portland",
          sharedDomains: ["clean_water", "healthcare"],
          mutualInteractions: 2,
          suggestionScore: 8,
          reason: "You share 2 domains and Both in Portland",
        },
      ]);

      const res = await app.request("/connections/suggestions");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Array<Record<string, unknown>>;
      expect(data.length).toBe(1);
      expect(data[0]!.suggestionScore).toBe(8);
      expect(data[0]!.reason).toContain("share 2 domains");
    });
  });

  // ── GET /connections/status/:humanId ────────────────────

  describe("GET /connections/status/:humanId — Connection status", () => {
    it("returns none status for unconnected users", async () => {
      mockGetStatus.mockResolvedValueOnce({
        status: "none",
        connectionId: null,
      });

      const res = await app.request("/connections/status/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).status).toBe("none");
    });

    it("returns accepted status with connectedSince for connected users", async () => {
      mockGetStatus.mockResolvedValueOnce({
        status: "accepted",
        connectionId: "conn-1",
        connectedSince: "2026-01-15T00:00:00.000Z",
      });

      const res = await app.request("/connections/status/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).status).toBe("accepted");
      expect((body.data as Record<string, unknown>).connectedSince).toBeTruthy();
    });

    it("returns pending status with direction for pending requests", async () => {
      mockGetStatus.mockResolvedValueOnce({
        status: "pending",
        connectionId: "conn-1",
        direction: "sent",
      });

      const res = await app.request("/connections/status/b1c2d3e4-f5a6-7890-abcd-ef1234567890");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect((body.data as Record<string, unknown>).status).toBe("pending");
      expect((body.data as Record<string, unknown>).direction).toBe("sent");
    });
  });
});
