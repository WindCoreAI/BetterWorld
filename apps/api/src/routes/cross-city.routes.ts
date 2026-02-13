/**
 * Cross-City Routes (Sprint 13 — Phase 3 Integration)
 *
 * GET /compare         — Full cross-city comparison metrics
 * GET /compare/:metric — Single metric detail (e.g., "problems_per_capita")
 */
import { AppError } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import {
  getComparativeMetrics,
  getSingleMetric,
} from "../services/cross-city.service.js";

const crossCityRoutes = new Hono<AppEnv>();

const VALID_METRICS = [
  "problems_per_capita",
  "observations",
  "validator_density",
  "problems",
  "validator_count",
] as const;

// ============================================================================
// GET /compare — Full cross-city comparison
// ============================================================================

crossCityRoutes.get("/compare", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const metrics = await getComparativeMetrics(db);

  return c.json({
    ok: true,
    data: metrics,
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /compare/:metric — Single metric detail
// ============================================================================

crossCityRoutes.get("/compare/:metric", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const metric = c.req.param("metric");

  if (!VALID_METRICS.includes(metric as (typeof VALID_METRICS)[number])) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid metric '${metric}'. Valid metrics: ${VALID_METRICS.join(", ")}`,
    );
  }

  const result = await getSingleMetric(db, metric);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

export default crossCityRoutes;
