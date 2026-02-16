/**
 * Discussion Routes (Sprint 16: Social Fabric Foundation)
 *
 * 5 endpoints: create thread, list threads, get thread, create reply, list replies.
 */
import { paginationQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { DiscussionService, DiscussionError } from "../services/discussion.service.js";

const discussionRoutes = new Hono<AppEnv>();

const createThreadSchema = z.object({
  scopeType: z.enum(["domain", "city"]),
  scopeValue: z.string().min(1).max(100),
  title: z.string().min(5).max(200),
  content: z.string().min(10).max(2000),
});

const createReplySchema = z.object({
  content: z.string().min(2).max(1000),
});

const listThreadsQuerySchema = paginationQuerySchema.extend({
  scopeType: z.enum(["domain", "city"]),
  scopeValue: z.string().min(1),
  sort: z.enum(["activity", "recent"]).optional().default("activity"),
});

// POST /discussions/threads — Create thread
discussionRoutes.post("/threads", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = createThreadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" },
      requestId: c.get("requestId"),
    }, 400);
  }

  try {
    const service = new DiscussionService(db);
    const result = await service.createThread({
      authorHumanId: human.id,
      authorDisplayName: human.displayName,
      scopeType: parsed.data.scopeType,
      scopeValue: parsed.data.scopeValue,
      title: parsed.data.title,
      content: parsed.data.content,
    });

    return c.json({
      ok: true,
      data: {
        id: result.id,
        scopeType: result.scopeType,
        scopeValue: result.scopeValue,
        title: result.title,
        content: result.content,
        authorHumanId: result.authorHumanId,
        authorDisplayName: result.authorDisplayName,
        guardrailStatus: result.guardrailStatus,
        replyCount: result.replyCount,
        createdAt: result.createdAt.toISOString(),
      },
      requestId: c.get("requestId"),
    }, 201);
  } catch (err) {
    if (err instanceof DiscussionError) {
      const statusMap: Record<string, number> = {
        INVALID_SCOPE: 400,
        VALIDATION_ERROR: 400,
        CONTENT_REJECTED: 403,
        THREAD_RATE_LIMIT: 429,
      };
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, (statusMap[err.code] ?? 400) as 400);
    }
    throw err;
  }
});

// GET /discussions/threads — List threads by scope (public, approved only)
discussionRoutes.get("/threads", async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const query = c.req.query();
  const parsed = listThreadsQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid query parameters" } }, 400);
  }

  const service = new DiscussionService(db);
  const result = await service.listThreads({
    scopeType: parsed.data.scopeType,
    scopeValue: parsed.data.scopeValue,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    sort: parsed.data.sort as "activity" | "recent",
  });

  return c.json({
    ok: true,
    data: result.items,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      count: result.items.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /discussions/threads/:threadId — Get single thread (public, approved only)
discussionRoutes.get("/threads/:threadId", async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const threadId = c.req.param("threadId");
  const service = new DiscussionService(db);
  const thread = await service.getThread(threadId);

  if (!thread) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Thread not found" } }, 404);
  }

  return c.json({
    ok: true,
    data: thread,
    requestId: c.get("requestId"),
  });
});

// POST /discussions/threads/:threadId/replies — Create reply
discussionRoutes.post("/threads/:threadId/replies", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const threadId = c.req.param("threadId");
  const body = await c.req.json();
  const parsed = createReplySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" },
      requestId: c.get("requestId"),
    }, 400);
  }

  try {
    const service = new DiscussionService(db);
    const result = await service.createReply({
      threadId,
      authorHumanId: human.id,
      authorDisplayName: human.displayName,
      content: parsed.data.content,
    });

    return c.json({
      ok: true,
      data: {
        id: result.id,
        threadId: result.threadId,
        content: result.content,
        authorHumanId: result.authorHumanId,
        authorDisplayName: result.authorDisplayName,
        guardrailStatus: result.guardrailStatus,
        createdAt: result.createdAt.toISOString(),
      },
      requestId: c.get("requestId"),
    }, 201);
  } catch (err) {
    if (err instanceof DiscussionError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        CONTENT_REJECTED: 403,
        REPLY_RATE_LIMIT: 429,
      };
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, (statusMap[err.code] ?? 400) as 400);
    }
    throw err;
  }
});

// GET /discussions/threads/:threadId/replies — List replies (public, approved only)
discussionRoutes.get("/threads/:threadId/replies", async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const threadId = c.req.param("threadId");
  const query = c.req.query();
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid query parameters" } }, 400);
  }

  const service = new DiscussionService(db);
  const result = await service.listReplies(threadId, {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  return c.json({
    ok: true,
    data: result.items,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      count: result.items.length,
    },
    requestId: c.get("requestId"),
  });
});

export default discussionRoutes;
