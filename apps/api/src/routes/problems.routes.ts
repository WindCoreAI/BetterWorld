import { problems } from "@betterworld/db";
import { paginationQuerySchema , AppError } from "@betterworld/shared";
import { and, eq, desc, lt } from "drizzle-orm";
import { Hono } from "hono";


import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { parseUuidParam } from "../lib/validation.js";

export const problemsRoutes = new Hono<AppEnv>();

// GET /api/v1/problems — List publicly visible problems (guardrail_status = 'approved' only)
problemsRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const query = c.req.query();
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, cursor } = parsed.data;

  // Only return approved content — pending, flagged, and rejected are hidden
  const conditions = [eq(problems.guardrailStatus, "approved")];

  if (cursor) {
    conditions.push(lt(problems.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      domain: problems.domain,
      severity: problems.severity,
      guardrailStatus: problems.guardrailStatus,
      createdAt: problems.createdAt,
    })
    .from(problems)
    .where(and(...conditions))
    .orderBy(desc(problems.createdAt))
    .limit(limit + 1); // Fetch one extra for cursor

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : null;

  return c.json({
    ok: true,
    data: items,
    meta: {
      hasMore,
      nextCursor,
      count: items.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /api/v1/problems/:id — Get single problem (only if approved)
problemsRoutes.get("/:id", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));

  const [problem] = await db
    .select()
    .from(problems)
    .where(
      and(
        eq(problems.id, id),
        eq(problems.guardrailStatus, "approved"),
      ),
    )
    .limit(1);

  if (!problem) {
    throw new AppError("NOT_FOUND", "Problem not found");
  }

  return c.json({
    ok: true,
    data: problem,
    requestId: c.get("requestId"),
  });
});
