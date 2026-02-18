/**
 * GDPR Routes (Sprint 20: Security Hardening)
 *
 * GET  /me/data-export      — Export all personal data (Article 15)
 * POST /me/deletion-request  — Initiate account deletion (Article 17)
 * GET  /me/deletion-request  — Get deletion request status
 * DELETE /me/deletion-request — Cancel pending deletion
 *
 * All endpoints require humanAuth().
 */
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { getDb, getRedis } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { logger } from "../middleware/logger.js";
import { exportUserData } from "../services/data-export.service.js";
import {
  requestDeletion,
  cancelDeletion,
  getDeletionStatus,
} from "../services/account-deletion.service.js";

const EXPORT_RATE_LIMIT_KEY_PREFIX = "gdpr:export:";
const EXPORT_RATE_LIMIT_MAX = 2;
const EXPORT_RATE_LIMIT_TTL = 86400; // 24 hours

const gdprRoutes = new Hono<AppEnv>();

// GET /me/data-export — Export all personal data (FR-005, FR-006, FR-007, FR-008)
gdprRoutes.get("/me/data-export", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const human = c.get("human");
  const redis = getRedis();

  // Rate limit: 2 requests per 24h per user (FR-008)
  // Uses atomic INCR-first pattern to avoid TOCTOU race condition
  if (redis) {
    const rateLimitKey = `${EXPORT_RATE_LIMIT_KEY_PREFIX}${human.id}`;
    const newCount = await redis.incr(rateLimitKey);
    if (newCount === 1) {
      await redis.expire(rateLimitKey, EXPORT_RATE_LIMIT_TTL);
    }

    if (newCount > EXPORT_RATE_LIMIT_MAX) {
      return c.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message:
              "Data export is limited to 2 requests per 24-hour period. Please try again later.",
          },
          requestId: c.get("requestId"),
        },
        429,
      );
    }
  }

  try {
    const exportData = await exportUserData(db, human.id);

    return c.json({
      ok: true,
      data: exportData,
      requestId: c.get("requestId"),
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown", humanId: human.id },
      "GDPR data export failed",
    );
    return c.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Data export failed" },
        requestId: c.get("requestId"),
      },
      500,
    );
  }
});

// POST /me/deletion-request — Initiate account deletion (FR-009, FR-014)
gdprRoutes.post("/me/deletion-request", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const human = c.get("human");

  try {
    const result = await requestDeletion(db, human.id);

    if (result.error) {
      const statusCode = result.error.code === "DELETION_ALREADY_PENDING" ? 409 : 422;
      return c.json(
        {
          ok: false,
          error: result.error,
          requestId: c.get("requestId"),
        },
        statusCode,
      );
    }

    return c.json(
      {
        ok: true,
        data: result.data,
        requestId: c.get("requestId"),
      },
      201,
    );
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown", humanId: human.id },
      "Account deletion request failed",
    );
    return c.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Deletion request failed" },
        requestId: c.get("requestId"),
      },
      500,
    );
  }
});

// GET /me/deletion-request — Get deletion request status (FR-009)
gdprRoutes.get("/me/deletion-request", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const human = c.get("human");

  const result = await getDeletionStatus(db, human.id);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// DELETE /me/deletion-request — Cancel pending deletion (FR-010)
gdprRoutes.delete("/me/deletion-request", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const human = c.get("human");

  try {
    const result = await cancelDeletion(db, human.id);

    if (result.error) {
      const statusCode = result.error.code === "NO_PENDING_DELETION" ? 404 : 409;
      return c.json(
        {
          ok: false,
          error: result.error,
          requestId: c.get("requestId"),
        },
        statusCode,
      );
    }

    return c.json({
      ok: true,
      data: result.data,
      requestId: c.get("requestId"),
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown", humanId: human.id },
      "Deletion cancellation failed",
    );
    return c.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Cancellation failed" },
        requestId: c.get("requestId"),
      },
      500,
    );
  }
});

export default gdprRoutes;
