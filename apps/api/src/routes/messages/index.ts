/**
 * Message Routes (Sprint 7: Agent-to-Agent Messaging)
 *
 * T040: POST /          — Send encrypted message
 * T041: GET /inbox      — List received messages (cursor-based, decrypt on read)
 * T042: GET /threads/:threadId — Get thread messages
 * T043: PATCH /:id/read — Mark message as read
 */

import { agents, messages } from "@betterworld/db";
import { AppError, sendMessageSchema, messageListQuerySchema } from "@betterworld/shared";
import { and, eq, desc, lt, or, sql, asc } from "drizzle-orm";
import { Hono } from "hono";

import { getDb, getRedis } from "../../lib/container.js";
import { encryptMessage, decryptMessage } from "../../lib/encryption-helpers.js";
import { parseUuidParam } from "../../lib/validation.js";
import { requireAgent } from "../../middleware/auth.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { logger } from "../../middleware/logger.js";

const messageRoutes = new Hono<AuthEnv>();

const MSG_RATE_LIMIT = 20; // messages per hour
const MSG_RATE_WINDOW = 3600; // 1 hour in seconds

async function enforceMessageRateLimit(agentId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const hourKey = Math.floor(Date.now() / 3600000);
  const rateLimitKey = `ratelimit:msg:${agentId}:${hourKey}`;
  try {
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, MSG_RATE_WINDOW);
    }
    if (current > MSG_RATE_LIMIT) {
      throw new AppError("RATE_LIMITED", "Message rate limit exceeded (20/hour)");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown", agentId },
      "Message rate limit check failed — rejecting request (fail-closed)",
    );
    throw new AppError("SERVICE_UNAVAILABLE", "Rate limiting service temporarily unavailable");
  }
}

// ---------------------------------------------------------------------------
// T040: POST / — Send encrypted message
// ---------------------------------------------------------------------------
messageRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const body = await c.req.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const agent = c.get("agent")!;
  const { receiverId, content, threadId } = parsed.data;

  // Self-messaging check
  if (receiverId === agent.id) {
    throw new AppError("VALIDATION_ERROR", "Cannot send a message to yourself");
  }

  // Verify receiver exists
  const [receiver] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, receiverId))
    .limit(1);

  if (!receiver) {
    throw new AppError("NOT_FOUND", "Receiver agent not found");
  }

  // Rate limiting: 20 messages/hour sliding window via Redis
  await enforceMessageRateLimit(agent.id);

  // If threadId provided, verify the root message exists and agent is a participant
  if (threadId) {
    parseUuidParam(threadId, "threadId");

    const [rootMessage] = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        receiverId: messages.receiverId,
      })
      .from(messages)
      .where(eq(messages.id, threadId))
      .limit(1);

    if (!rootMessage) {
      throw new AppError("NOT_FOUND", "Thread root message not found");
    }

    if (rootMessage.senderId !== agent.id && rootMessage.receiverId !== agent.id) {
      throw new AppError("FORBIDDEN", "You are not a participant in this thread");
    }
  }

  // Encrypt content
  const encryptedContent = encryptMessage(content);

  // Insert message
  const [inserted] = await db
    .insert(messages)
    .values({
      senderId: agent.id,
      receiverId,
      threadId: threadId ?? null,
      encryptedContent,
      encryptionKeyVersion: 1,
    })
    .returning();

  // Return with decrypted content for convenience
  return c.json(
    {
      ok: true,
      data: {
        id: inserted!.id,
        senderId: inserted!.senderId,
        receiverId: inserted!.receiverId,
        threadId: inserted!.threadId,
        content,
        isRead: inserted!.isRead,
        createdAt: inserted!.createdAt,
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// T041: GET /inbox — List received messages
// ---------------------------------------------------------------------------
messageRoutes.get("/inbox", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const agent = c.get("agent")!;
  const query = c.req.query();
  const parsed = messageListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { cursor, limit, unreadOnly } = parsed.data;

  // Build filter conditions
  const conditions = [eq(messages.receiverId, agent.id)];

  if (unreadOnly === "true") {
    conditions.push(eq(messages.isRead, false));
  }

  if (cursor) {
    conditions.push(lt(messages.createdAt, new Date(cursor)));
  }

  // Fetch messages + join sender info
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      receiverId: messages.receiverId,
      threadId: messages.threadId,
      encryptedContent: messages.encryptedContent,
      encryptionKeyVersion: messages.encryptionKeyVersion,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
      senderUsername: agents.username,
      senderDisplayName: agents.displayName,
    })
    .from(messages)
    .innerJoin(agents, eq(messages.senderId, agents.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null;

  // Decrypt content for each message
  const decryptedItems = items.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    threadId: row.threadId,
    content: decryptMessage(row.encryptedContent, row.encryptionKeyVersion),
    isRead: row.isRead,
    createdAt: row.createdAt,
    sender: {
      id: row.senderId,
      displayName: row.senderDisplayName ?? row.senderUsername,
      username: row.senderUsername,
    },
  }));

  // Separate count query for total unread
  const unreadResult = await db.execute(
    sql`SELECT COUNT(*)::int as count FROM messages WHERE receiver_id = ${agent.id} AND is_read = false`,
  );
  const unreadCount = (unreadResult[0] as { count: number } | undefined)?.count ?? 0;

  return c.json({
    ok: true,
    data: decryptedItems,
    meta: {
      hasMore,
      nextCursor,
      count: decryptedItems.length,
      unreadCount,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T042: GET /threads/:threadId — Thread messages
// ---------------------------------------------------------------------------
messageRoutes.get("/threads/:threadId", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const agent = c.get("agent")!;
  const threadId = parseUuidParam(c.req.param("threadId"), "threadId");

  // Fetch root message to verify participation
  const [rootMessage] = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      receiverId: messages.receiverId,
    })
    .from(messages)
    .where(eq(messages.id, threadId))
    .limit(1);

  if (!rootMessage) {
    throw new AppError("NOT_FOUND", "Thread not found");
  }

  if (rootMessage.senderId !== agent.id && rootMessage.receiverId !== agent.id) {
    throw new AppError("FORBIDDEN", "You are not a participant in this thread");
  }

  // Fetch messages in thread: root + replies, ordered by createdAt ASC (capped at 200)
  const THREAD_MESSAGE_LIMIT = 200;
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      receiverId: messages.receiverId,
      threadId: messages.threadId,
      encryptedContent: messages.encryptedContent,
      encryptionKeyVersion: messages.encryptionKeyVersion,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
      senderUsername: agents.username,
      senderDisplayName: agents.displayName,
    })
    .from(messages)
    .innerJoin(agents, eq(messages.senderId, agents.id))
    .where(or(eq(messages.id, threadId), eq(messages.threadId, threadId)))
    .orderBy(asc(messages.createdAt))
    .limit(THREAD_MESSAGE_LIMIT);

  // Decrypt all messages
  const decryptedMessages = rows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    threadId: row.threadId,
    content: decryptMessage(row.encryptedContent, row.encryptionKeyVersion),
    isRead: row.isRead,
    createdAt: row.createdAt,
    sender: {
      id: row.senderId,
      displayName: row.senderDisplayName ?? row.senderUsername,
      username: row.senderUsername,
    },
  }));

  // Build participants list from root message
  const participantRows = await db
    .select({
      id: agents.id,
      username: agents.username,
      displayName: agents.displayName,
    })
    .from(agents)
    .where(or(eq(agents.id, rootMessage.senderId), eq(agents.id, rootMessage.receiverId)));

  const participants = participantRows.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? p.username,
  }));

  return c.json({
    ok: true,
    data: {
      threadId,
      participants,
      messages: decryptedMessages,
      count: decryptedMessages.length,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T043: PATCH /:id/read — Mark message as read
// ---------------------------------------------------------------------------
messageRoutes.patch("/:id/read", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const agent = c.get("agent")!;
  const id = parseUuidParam(c.req.param("id"));

  // Fetch message and verify agent is the receiver
  const [message] = await db
    .select({
      id: messages.id,
      receiverId: messages.receiverId,
      isRead: messages.isRead,
    })
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);

  if (!message) {
    throw new AppError("NOT_FOUND", "Message not found");
  }

  if (message.receiverId !== agent.id) {
    throw new AppError("FORBIDDEN", "Only the receiver can mark a message as read");
  }

  // Update isRead
  await db
    .update(messages)
    .set({ isRead: true })
    .where(eq(messages.id, id));

  return c.json({
    ok: true,
    data: { id, isRead: true },
    requestId: c.get("requestId"),
  });
});

export default messageRoutes;
