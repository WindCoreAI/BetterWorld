/**
 * Message Routes Integration Tests (Sprint 7 — T040-T043)
 *
 * 13 tests covering:
 *   POST /          — Send encrypted message (validation, self-message, receiver check, rate limit, thread)
 *   GET /inbox      — List received messages (cursor pagination, decrypt, unread filter, unread count)
 *   GET /threads/:threadId — Thread messages (participation check, decrypt, ASC ordering)
 *   PATCH /:id/read — Mark as read (receiver-only authorization)
 *
 * Follows the mission-crud.test.ts pattern: import route directly,
 * mock requireAgent middleware to bypass API key + bcrypt, mock DB with
 * chainable mocks.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

// DB chainable mocks
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbExecute = vi.fn();
const mockDbReturning = vi.fn();

// Redis mock
const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
};

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    execute: mockDbExecute,
  })),
  getRedis: vi.fn(() => mockRedis),
}));

vi.mock("../../../src/lib/encryption-helpers.js", () => ({
  encryptMessage: vi.fn((content: string) => `encrypted:${content}`),
  decryptMessage: vi.fn((encrypted: string, _version: number) =>
    encrypted.replace("encrypted:", ""),
  ),
}));

// Mock requireAgent middleware to bypass API key + bcrypt verification
const MOCK_AGENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MOCK_RECEIVER_ID = "11111111-2222-3333-4444-555555555555";

vi.mock("../../../src/middleware/auth.js", () => ({
  requireAgent: () => {
    return async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("agent", {
        id: MOCK_AGENT_ID,
        username: "test-agent",
        framework: "claude",
        claimStatus: "approved",
        rateLimitOverride: null,
      });
      c.set("authRole", "agent");
      await next();
    };
  },
}));

// Mock logger to suppress noise
vi.mock("../../../src/middleware/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Response types ──────────────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  requestId: string;
}

interface InboxBody<T = unknown> {
  ok: true;
  data: T[];
  meta: {
    hasMore: boolean;
    nextCursor: string | null;
    count: number;
    unreadCount: number;
  };
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Test constants ──────────────────────────────────────────────────

const MOCK_THREAD_ID = "cccccccc-dddd-eeee-ffff-000000000000";
const MOCK_MESSAGE_ID = "dddddddd-eeee-ffff-0000-111111111111";

function validMessageBody(overrides: Record<string, unknown> = {}) {
  return {
    receiverId: MOCK_RECEIVER_ID,
    content: "Hello, let us collaborate on this mission!",
    ...overrides,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a select chain for a single-row lookup: select -> from -> where -> limit */
function singleRowSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

/** Create a select chain with innerJoin: select -> from -> innerJoin -> where -> orderBy -> limit */
function joinSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

/** Create a select chain without limit: select -> from -> where (resolves directly) */
function selectChainNoLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Message Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();

    // Default Redis behavior: first call in rate limit window
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    const messageRoutes = (await import("../../routes/messages/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/messages", messageRoutes);
    app.onError(errorHandler);
  });

  // ── POST / — Send encrypted message ─────────────────────────────

  describe("POST / — Send encrypted message", () => {
    it("should successfully send an encrypted message", async () => {
      const now = new Date();

      // Query 1: receiver lookup — found
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: MOCK_RECEIVER_ID }]),
      );

      // Insert: message inserted
      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: MOCK_MESSAGE_ID,
          senderId: MOCK_AGENT_ID,
          receiverId: MOCK_RECEIVER_ID,
          threadId: null,
          isRead: false,
          createdAt: now,
        },
      ]);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: mockReturning }),
      });

      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMessageBody()),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody<{
        id: string;
        senderId: string;
        receiverId: string;
        threadId: string | null;
        content: string;
        isRead: boolean;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(MOCK_MESSAGE_ID);
      expect(body.data.senderId).toBe(MOCK_AGENT_ID);
      expect(body.data.receiverId).toBe(MOCK_RECEIVER_ID);
      expect(body.data.threadId).toBeNull();
      expect(body.data.content).toBe("Hello, let us collaborate on this mission!");
      expect(body.data.isRead).toBe(false);
      // Verify Redis rate limit was checked
      expect(mockRedis.incr).toHaveBeenCalledOnce();
      expect(mockRedis.expire).toHaveBeenCalledOnce();
    });

    it("should reject self-messaging", async () => {
      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMessageBody({ receiverId: MOCK_AGENT_ID })),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("yourself");
    });

    it("should reject when receiver not found", async () => {
      // Query 1: receiver lookup — empty
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMessageBody()),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Receiver agent not found");
    });

    it("should reject invalid body (missing fields)", async () => {
      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should enforce rate limit (20/hour)", async () => {
      // Redis incr returns > 20 (limit exceeded)
      mockRedis.incr.mockResolvedValue(21);

      // Query 1: receiver lookup — found (rate limit check happens after)
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: MOCK_RECEIVER_ID }]),
      );

      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMessageBody()),
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.message).toContain("20/hour");
    });

    it("should fail closed when Redis throws during rate limiting", async () => {
      // Redis incr throws
      mockRedis.incr.mockRejectedValue(new Error("Redis connection lost"));

      // Query 1: receiver lookup — found
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: MOCK_RECEIVER_ID }]),
      );

      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validMessageBody()),
      });

      expect(res.status).toBe(503);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("Rate limiting service temporarily unavailable");
    });

    it("should validate thread participation when threadId provided", async () => {
      // Query 1: receiver lookup — found
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: MOCK_RECEIVER_ID }]),
      );

      // Query 2: thread root message lookup — found but agent is NOT a participant
      const otherAgentId = "22222222-3333-4444-5555-666666666666";
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: MOCK_THREAD_ID,
            senderId: otherAgentId,
            receiverId: MOCK_RECEIVER_ID, // neither is MOCK_AGENT_ID
          },
        ]),
      );

      const res = await app.request("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          validMessageBody({ threadId: MOCK_THREAD_ID }),
        ),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("not a participant");
    });
  });

  // ── GET /inbox — List received messages ───────────────────────────

  describe("GET /inbox — List received messages", () => {
    it("should return decrypted messages with sender info", async () => {
      const now = new Date();
      const inboxRows = [
        {
          id: MOCK_MESSAGE_ID,
          senderId: MOCK_RECEIVER_ID,
          receiverId: MOCK_AGENT_ID,
          threadId: null,
          encryptedContent: "encrypted:Hello from sender",
          encryptionKeyVersion: 1,
          isRead: false,
          createdAt: now,
          senderUsername: "sender-agent",
          senderDisplayName: "Sender Agent",
        },
      ];

      // Query 1: inbox messages with innerJoin
      mockDbSelect.mockReturnValueOnce(joinSelectChain(inboxRows));

      // Query 2: unread count via db.execute
      mockDbExecute.mockResolvedValueOnce([{ count: 1 }]);

      const res = await app.request("/messages/inbox");

      expect(res.status).toBe(200);
      const body = (await res.json()) as InboxBody<{
        id: string;
        senderId: string;
        content: string;
        sender: { id: string; displayName: string; username: string };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.id).toBe(MOCK_MESSAGE_ID);
      expect(body.data[0]!.content).toBe("Hello from sender"); // decrypted
      expect(body.data[0]!.sender.id).toBe(MOCK_RECEIVER_ID);
      expect(body.data[0]!.sender.displayName).toBe("Sender Agent");
      expect(body.data[0]!.sender.username).toBe("sender-agent");
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.nextCursor).toBeNull();
      expect(body.meta.count).toBe(1);
      expect(body.meta.unreadCount).toBe(1);
    });

    it("should filter unread messages only when unreadOnly=true", async () => {
      // Query 1: inbox with unreadOnly filter — returns empty
      mockDbSelect.mockReturnValueOnce(joinSelectChain([]));

      // Query 2: unread count
      mockDbExecute.mockResolvedValueOnce([{ count: 0 }]);

      const res = await app.request("/messages/inbox?unreadOnly=true");

      expect(res.status).toBe(200);
      const body = (await res.json()) as InboxBody<unknown>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(0);
      expect(body.meta.unreadCount).toBe(0);
    });
  });

  // ── GET /threads/:threadId — Thread messages ──────────────────────

  describe("GET /threads/:threadId — Thread messages", () => {
    it("should return thread messages ordered by createdAt ASC", async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 60000);

      // Query 1: root message lookup — agent is sender (participant)
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: MOCK_THREAD_ID,
            senderId: MOCK_AGENT_ID,
            receiverId: MOCK_RECEIVER_ID,
          },
        ]),
      );

      // Query 2: thread messages with innerJoin (root + replies, ASC ordered)
      const threadRows = [
        {
          id: MOCK_THREAD_ID,
          senderId: MOCK_AGENT_ID,
          receiverId: MOCK_RECEIVER_ID,
          threadId: null,
          encryptedContent: "encrypted:First message",
          encryptionKeyVersion: 1,
          isRead: true,
          createdAt: earlier,
          senderUsername: "test-agent",
          senderDisplayName: "Test Agent",
        },
        {
          id: MOCK_MESSAGE_ID,
          senderId: MOCK_RECEIVER_ID,
          receiverId: MOCK_AGENT_ID,
          threadId: MOCK_THREAD_ID,
          encryptedContent: "encrypted:Reply message",
          encryptionKeyVersion: 1,
          isRead: false,
          createdAt: now,
          senderUsername: "receiver-agent",
          senderDisplayName: "Receiver Agent",
        },
      ];
      mockDbSelect.mockReturnValueOnce(joinSelectChain(threadRows));

      // Query 3: participants lookup (select -> from -> where, no limit)
      mockDbSelect.mockReturnValueOnce(
        selectChainNoLimit([
          { id: MOCK_AGENT_ID, username: "test-agent", displayName: "Test Agent" },
          { id: MOCK_RECEIVER_ID, username: "receiver-agent", displayName: "Receiver Agent" },
        ]),
      );

      const res = await app.request(`/messages/threads/${MOCK_THREAD_ID}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        threadId: string;
        participants: Array<{ id: string; username: string; displayName: string }>;
        messages: Array<{
          id: string;
          content: string;
          sender: { id: string; displayName: string };
        }>;
        count: number;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.threadId).toBe(MOCK_THREAD_ID);
      expect(body.data.participants).toHaveLength(2);
      expect(body.data.messages).toHaveLength(2);
      // Verify decryption happened
      expect(body.data.messages[0]!.content).toBe("First message");
      expect(body.data.messages[1]!.content).toBe("Reply message");
      // Verify sender info
      expect(body.data.messages[0]!.sender.displayName).toBe("Test Agent");
      expect(body.data.messages[1]!.sender.displayName).toBe("Receiver Agent");
      expect(body.data.count).toBe(2);
    });

    it("should reject non-participant from viewing thread", async () => {
      const otherAgentId = "22222222-3333-4444-5555-666666666666";

      // Query 1: root message lookup — agent is NOT a participant
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: MOCK_THREAD_ID,
            senderId: otherAgentId,
            receiverId: MOCK_RECEIVER_ID,
          },
        ]),
      );

      const res = await app.request(`/messages/threads/${MOCK_THREAD_ID}`);

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("not a participant");
    });
  });

  // ── PATCH /:id/read — Mark message as read ────────────────────────

  describe("PATCH /:id/read — Mark message as read", () => {
    it("should mark message as read when agent is the receiver", async () => {
      // Query 1: message lookup — agent is the receiver
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: MOCK_MESSAGE_ID,
            receiverId: MOCK_AGENT_ID,
            isRead: false,
          },
        ]),
      );

      // Update: set isRead = true
      const mockSetWhere = vi.fn().mockResolvedValue(undefined);
      const mockSetFn = vi.fn().mockReturnValue({ where: mockSetWhere });
      mockDbUpdate.mockReturnValue({ set: mockSetFn });

      const res = await app.request(`/messages/${MOCK_MESSAGE_ID}/read`, {
        method: "PATCH",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        id: string;
        isRead: boolean;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(MOCK_MESSAGE_ID);
      expect(body.data.isRead).toBe(true);
    });

    it("should reject when agent is not the receiver", async () => {
      // Query 1: message lookup — receiver is someone else
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: MOCK_MESSAGE_ID,
            receiverId: MOCK_RECEIVER_ID, // Different from MOCK_AGENT_ID
            isRead: false,
          },
        ]),
      );

      const res = await app.request(`/messages/${MOCK_MESSAGE_ID}/read`, {
        method: "PATCH",
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Only the receiver");
    });
  });
});
