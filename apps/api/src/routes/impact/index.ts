/**
 * Impact Dashboard Routes (Sprint 9: Reputation & Impact)
 *
 * GET /impact/dashboard — Public aggregate metrics
 * GET /impact/heatmap — Mission density heatmap data
 */
import { heatmapQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import {
  aggregateDashboardMetrics,
  aggregateHeatmapData,
  getCachedDashboard,
  getCachedHeatmap,
} from "../../lib/metrics-aggregator.js";

const impactRoutes = new Hono<AppEnv>();

// ────────────────── GET /impact/dashboard ──────────────────

impactRoutes.get("/dashboard", async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const redis = getRedis();

  // Cache first
  if (redis) {
    const cached = await getCachedDashboard(redis);
    if (cached) {
      return c.json({
        ok: true,
        data: cached,
        requestId: c.get("requestId"),
      });
    }
  }

  // Fallback to live query
  const metrics = await aggregateDashboardMetrics(db);

  return c.json({
    ok: true,
    data: metrics,
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /impact/heatmap ──────────────────

impactRoutes.get("/heatmap", async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const redis = getRedis();
  const query = heatmapQuerySchema.parse(c.req.query());

  // Cache first
  if (redis) {
    const cached = await getCachedHeatmap(redis, query.period);
    if (cached) {
      // Apply bounds filter if provided
      let points = cached;
      if (
        query.sw_lat !== undefined &&
        query.sw_lng !== undefined &&
        query.ne_lat !== undefined &&
        query.ne_lng !== undefined
      ) {
        points = points.filter(
          (p) =>
            p.lat >= query.sw_lat! &&
            p.lat <= query.ne_lat! &&
            p.lng >= query.sw_lng! &&
            p.lng <= query.ne_lng!,
        );
      }

      return c.json({
        ok: true,
        data: points,
        requestId: c.get("requestId"),
      });
    }
  }

  // Fallback to live query
  const points = await aggregateHeatmapData(db);

  return c.json({
    ok: true,
    data: points,
    requestId: c.get("requestId"),
  });
});

export default impactRoutes;
