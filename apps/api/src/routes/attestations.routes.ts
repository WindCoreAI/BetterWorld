/**
 * Attestation Routes (Sprint 12 — T070)
 *
 * POST /problems/:problemId/attestations — Submit attestation (humanAuth)
 * GET  /problems/:problemId/attestations — Get counts + user's own
 * DELETE /problems/:problemId/attestations — Remove own attestation
 */
import { AppError } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb, getRedis } from "../lib/container.js";
import { parseUuidParam } from "../lib/validation.js";
import { humanAuth } from "../middleware/humanAuth.js";
import {
  submitAttestation,
  getAttestationCounts,
  removeAttestation,
  getUserAttestation,
} from "../services/attestation.service.js";

const attestationRoutes = new Hono<AppEnv>();

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600; // 1 hour

async function checkAttestationRateLimit(humanId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false; // Fail closed

  const key = `rate:attestation:${humanId}`;
  const count = await redis.get(key);
  if (count && parseInt(count, 10) >= RATE_LIMIT_MAX) {
    return false;
  }
  return true;
}

async function incrementAttestationRateLimit(humanId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `rate:attestation:${humanId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }
}

const attestationSchema = z.object({
  statusType: z.enum(["confirmed", "resolved", "not_found"]),
});

// POST /problems/:problemId/attestations
attestationRoutes.post("/:problemId/attestations", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const problemId = parseUuidParam(c.req.param("problemId"), "problemId");
  const human = c.get("human");

  const withinLimit = await checkAttestationRateLimit(human.id);
  if (!withinLimit) {
    throw new AppError("RATE_LIMITED", "Attestation rate limit exceeded (20/hour)");
  }

  const body = await c.req.json();
  const parsed = attestationSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid attestation", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await submitAttestation(
    db,
    problemId,
    human.id,
    parsed.data.statusType,
  );

  await incrementAttestationRateLimit(human.id);

  return c.json(
    {
      ok: true,
      data: {
        attestationId: result.id,
        counts: result.counts,
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

// GET /problems/:problemId/attestations
attestationRoutes.get("/:problemId/attestations", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const problemId = parseUuidParam(c.req.param("problemId"), "problemId");
  const human = c.get("human");

  const [counts, userAttestation] = await Promise.all([
    getAttestationCounts(db, problemId),
    getUserAttestation(db, problemId, human.id),
  ]);

  return c.json({
    ok: true,
    data: {
      counts,
      userAttestation,
    },
    requestId: c.get("requestId"),
  });
});

// DELETE /problems/:problemId/attestations
attestationRoutes.delete("/:problemId/attestations", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const problemId = parseUuidParam(c.req.param("problemId"), "problemId");
  const human = c.get("human");

  const removed = await removeAttestation(db, problemId, human.id);

  if (!removed) {
    throw new AppError("NOT_FOUND", "No attestation found to remove");
  }

  return c.json({
    ok: true,
    data: { removed: true },
    requestId: c.get("requestId"),
  });
});

export default attestationRoutes;
