/**
 * Observation Routes (Sprint 10 — US3)
 *
 * POST /problems/:problemId/observations — Attach observation to problem
 * POST /observations — Standalone observation (auto-creates problem)
 * GET /observations/:id — Get observation details
 * GET /problems/:problemId/observations — List observations for a problem
 */
import { createObservationSchema, createStandaloneObservationSchema } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { getDb, getRedis } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import {
  validateGPS,
  checkObservationRateLimit,
  incrementObservationRateLimit,
  createObservationForProblem,
  createStandaloneObservation,
  getObservation,
  listObservationsForProblem,
  ObservationError,
} from "../services/observation.service.js";

const observationRoutes = new Hono<AppEnv>();

// ============================================================================
// POST /problems/:problemId/observations — Attach observation to a problem
// ============================================================================

observationRoutes.post("/problems/:problemId/observations", humanAuth(), async (c) => {
  const human = c.get("human");
  const problemId = c.req.param("problemId");
  const db = getDb();
  const redis = getRedis();

  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(problemId)) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid problem ID format" }, requestId: c.get("requestId") },
      400,
    );
  }

  // Rate limit check
  const allowed = await checkObservationRateLimit(redis, human.id);
  if (!allowed) {
    return c.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Observation submission rate limit exceeded" }, requestId: c.get("requestId") },
      429,
    );
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: c.get("requestId") },
      400,
    );
  }

  const parsed = createObservationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" }, requestId: c.get("requestId") },
      400,
    );
  }

  // GPS validation
  const gpsResult = validateGPS(parsed.data.gpsLat, parsed.data.gpsLng, parsed.data.gpsAccuracyMeters);
  if (!gpsResult.valid) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: gpsResult.error! }, requestId: c.get("requestId") },
      400,
    );
  }

  try {
    const result = await createObservationForProblem(db, human.id, problemId, parsed.data);

    // Increment rate limit after success
    await incrementObservationRateLimit(redis, human.id);

    return c.json(
      {
        ok: true,
        data: result.observation,
        requestId: c.get("requestId"),
      },
      201,
    );
  } catch (err) {
    if (err instanceof ObservationError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        PROXIMITY_ERROR: 400,
      };
      const status = statusMap[err.code] ?? 400;
      return c.json(
        { ok: false, error: { code: err.code, message: err.message }, requestId: c.get("requestId") },
        status as 400,
      );
    }
    throw err;
  }
});

// ============================================================================
// POST /observations — Standalone observation (auto-creates problem)
// ============================================================================

observationRoutes.post("/observations", humanAuth(), async (c) => {
  const human = c.get("human");
  const db = getDb();
  const redis = getRedis();

  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Rate limit check
  const allowed = await checkObservationRateLimit(redis, human.id);
  if (!allowed) {
    return c.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Observation submission rate limit exceeded" }, requestId: c.get("requestId") },
      429,
    );
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: c.get("requestId") },
      400,
    );
  }

  const parsed = createStandaloneObservationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" }, requestId: c.get("requestId") },
      400,
    );
  }

  // GPS validation
  const gpsResult = validateGPS(parsed.data.gpsLat, parsed.data.gpsLng, parsed.data.gpsAccuracyMeters);
  if (!gpsResult.valid) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: gpsResult.error! }, requestId: c.get("requestId") },
      400,
    );
  }

  try {
    const result = await createStandaloneObservation(db, human.id, parsed.data);

    // Increment rate limit after success
    await incrementObservationRateLimit(redis, human.id);

    return c.json(
      {
        ok: true,
        data: {
          observation: result.observation,
          problem: result.problem,
        },
        requestId: c.get("requestId"),
      },
      201,
    );
  } catch (err) {
    if (err instanceof ObservationError) {
      return c.json(
        { ok: false, error: { code: err.code, message: err.message }, requestId: c.get("requestId") },
        400,
      );
    }
    throw err;
  }
});

// ============================================================================
// GET /observations/:id — Get observation details
// ============================================================================

observationRoutes.get("/observations/:id", humanAuth(), async (c) => {
  const observationId = c.req.param("id");
  const db = getDb();

  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(observationId)) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid observation ID format" }, requestId: c.get("requestId") },
      400,
    );
  }

  const observation = await getObservation(db, observationId);
  if (!observation) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Observation not found" }, requestId: c.get("requestId") },
      404,
    );
  }

  return c.json({
    ok: true,
    data: observation,
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /problems/:problemId/observations — List observations for a problem
// ============================================================================

observationRoutes.get("/problems/:problemId/observations", humanAuth(), async (c) => {
  const problemId = c.req.param("problemId");
  const db = getDb();

  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(problemId)) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid problem ID format" }, requestId: c.get("requestId") },
      400,
    );
  }

  const cursor = c.req.query("cursor");
  const limitStr = c.req.query("limit");
  const verificationStatus = c.req.query("verificationStatus");

  let limit = 20;
  if (limitStr) {
    limit = parseInt(limitStr, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      limit = 20;
    }
  }

  try {
    const result = await listObservationsForProblem(db, problemId, {
      cursor: cursor ?? undefined,
      limit,
      verificationStatus: verificationStatus ?? undefined,
    });

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof ObservationError && err.code === "NOT_FOUND") {
      return c.json(
        { ok: false, error: { code: "NOT_FOUND", message: err.message }, requestId: c.get("requestId") },
        404,
      );
    }
    throw err;
  }
});

export default observationRoutes;
