/**
 * Pattern Routes (Sprint 13 — Phase 3 Integration)
 *
 * GET  /         — List clusters (filters: domain, city, systemic; cursor pagination)
 * GET  /:id      — Cluster detail with member problems
 * POST /admin/refresh — Trigger re-clustering (admin auth)
 */
import { problems, problemClusters } from "@betterworld/db";
import { AppError, OPEN311_CITY_CONFIGS, ALLOWED_DOMAINS } from "@betterworld/shared";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { parseUuidParam } from "../lib/validation.js";
import { requireAdmin } from "../middleware/auth.js";
import { findClusters } from "../services/pattern-aggregation.js";

const patternRoutes = new Hono<AppEnv>();

// ── Schemas ──────────────────────────────────────────────────

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  domain: z.string().optional(),
  city: z.string().optional(),
  systemic: z.coerce.boolean().optional(),
});

// ============================================================================
// GET / — List clusters
// ============================================================================

patternRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const query = c.req.query();
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, cursor, domain, city, systemic } = parsed.data;
  const conditions = [eq(problemClusters.isActive, true)];

  if (domain) conditions.push(eq(problemClusters.domain, domain as never));
  if (city) conditions.push(eq(problemClusters.city, city));
  if (systemic !== undefined) conditions.push(eq(problemClusters.isSystemic, systemic));

  if (cursor) {
    const [cursorCluster] = await db
      .select({ createdAt: problemClusters.createdAt })
      .from(problemClusters)
      .where(eq(problemClusters.id, cursor))
      .limit(1);
    if (cursorCluster) {
      conditions.push(lt(problemClusters.createdAt, cursorCluster.createdAt));
    }
  }

  const rows = await db
    .select({
      id: problemClusters.id,
      title: problemClusters.title,
      description: problemClusters.description,
      domain: problemClusters.domain,
      scope: problemClusters.scope,
      city: problemClusters.city,
      memberCount: problemClusters.memberCount,
      memberProblemIds: problemClusters.memberProblemIds,
      isSystemic: problemClusters.isSystemic,
      isActive: problemClusters.isActive,
      lastAggregatedAt: problemClusters.lastAggregatedAt,
      createdAt: problemClusters.createdAt,
      updatedAt: problemClusters.updatedAt,
    })
    .from(problemClusters)
    .where(and(...conditions))
    .orderBy(desc(problemClusters.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];

  return c.json({
    ok: true,
    data: {
      clusters: items,
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /:id — Cluster detail with member problems
// ============================================================================

patternRoutes.get("/:id", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = parseUuidParam(c.req.param("id"), "id");

  const [cluster] = await db
    .select({
      id: problemClusters.id,
      title: problemClusters.title,
      description: problemClusters.description,
      domain: problemClusters.domain,
      scope: problemClusters.scope,
      city: problemClusters.city,
      memberCount: problemClusters.memberCount,
      memberProblemIds: problemClusters.memberProblemIds,
      isSystemic: problemClusters.isSystemic,
      isActive: problemClusters.isActive,
      lastAggregatedAt: problemClusters.lastAggregatedAt,
      createdAt: problemClusters.createdAt,
      updatedAt: problemClusters.updatedAt,
    })
    .from(problemClusters)
    .where(eq(problemClusters.id, id))
    .limit(1);

  if (!cluster) throw new AppError("NOT_FOUND", "Cluster not found");

  // Fetch member problems
  const memberIds = cluster.memberProblemIds as string[];
  let memberProblems: Array<Record<string, unknown>> = [];

  if (memberIds.length > 0) {
    memberProblems = await db
      .select({
        id: problems.id,
        title: problems.title,
        description: problems.description,
        domain: problems.domain,
        severity: problems.severity,
        locationName: problems.locationName,
        latitude: problems.latitude,
        longitude: problems.longitude,
        createdAt: problems.createdAt,
      })
      .from(problems)
      .where(inArray(problems.id, memberIds));
  }

  return c.json({
    ok: true,
    data: {
      ...cluster,
      memberProblems,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// POST /admin/refresh — Trigger re-clustering (admin auth)
// ============================================================================

patternRoutes.post("/admin/refresh", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const cityIds = Object.keys(OPEN311_CITY_CONFIGS);
  const domains = ALLOWED_DOMAINS;

  let totalClusters = 0;
  let totalSystemic = 0;

  for (const cityId of cityIds) {
    for (const domain of domains) {
      try {
        const clusters = await findClusters(db, domain, cityId);
        totalClusters += clusters.length;
        totalSystemic += clusters.filter((c) => c.isSystemic).length;
      } catch {
        // Non-fatal; log and continue with next combination
      }
    }
  }

  return c.json({
    ok: true,
    data: {
      totalClusters,
      totalSystemic,
      citiesProcessed: cityIds.length,
      domainsProcessed: domains.length,
    },
    requestId: c.get("requestId"),
  });
});

export default patternRoutes;
