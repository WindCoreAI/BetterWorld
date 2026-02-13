/**
 * Dispute Routes (Sprint 13 — Consensus Disputes)
 *
 * POST /disputes           — File a dispute against a consensus result (agent auth)
 * GET  /disputes           — List own disputes (agent auth)
 * GET  /disputes/:id       — Dispute detail (agent auth + ownership check)
 * GET  /disputes/admin/queue       — Admin dispute queue (human auth + admin)
 * POST /disputes/admin/:id/resolve — Admin resolve dispute (human auth + admin)
 *
 * NOTE: This is distinct from apps/api/src/routes/admin/disputes.ts which
 * handles Sprint 8 evidence appeal disputes. This file handles Sprint 13
 * consensus disputes filed by agents against peer validation decisions.
 */
import { disputes } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import {
  fileDisputeSchema,
  resolveDisputeSchema,
} from "@betterworld/shared/types/phase3";
import { eq, and, desc, gt, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../lib/container.js";
import { parseUuidParam } from "../lib/validation.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  fileDispute,
  resolveDispute,
} from "../services/dispute.service.js";
import { getFlag } from "../services/feature-flags.js";

const disputesRoutes = new Hono<AuthEnv>();

// ============================================================================
// Query schemas
// ============================================================================

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default("20"),
  status: z
    .enum(["open", "admin_review", "upheld", "overturned", "dismissed"])
    .optional(),
});

// ============================================================================
// POST /disputes — File a dispute (agent auth)
// ============================================================================

disputesRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  // Check feature flag
  const enabled = await getFlag(redis, "DISPUTES_ENABLED");
  if (!enabled) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Dispute resolution is not yet enabled",
    );
  }

  const agent = c.get("agent")!;
  const body = await c.req.json();
  const parsed = fileDisputeSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid dispute input", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const dispute = await fileDispute(
    db,
    agent.id,
    parsed.data.consensusId,
    parsed.data.reasoning,
  );

  return c.json(
    {
      ok: true,
      data: {
        ...dispute,
        createdAt: dispute.createdAt.toISOString(),
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

// ============================================================================
// GET /disputes — List own disputes (agent auth)
// ============================================================================

disputesRoutes.get("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const agent = c.get("agent")!;
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const query = parsed.data;

  const conditions = [eq(disputes.challengerAgentId, agent.id)];

  if (query.status) {
    conditions.push(eq(disputes.status, query.status));
  }

  if (query.cursor) {
    conditions.push(gt(disputes.id, query.cursor));
  }

  const rows = await db
    .select({
      id: disputes.id,
      consensusId: disputes.consensusId,
      stakeAmount: disputes.stakeAmount,
      reasoning: disputes.reasoning,
      status: disputes.status,
      adminDecision: disputes.adminDecision,
      stakeReturned: disputes.stakeReturned,
      bonusPaid: disputes.bonusPaid,
      resolvedAt: disputes.resolvedAt,
      createdAt: disputes.createdAt,
    })
    .from(disputes)
    .where(and(...conditions))
    .orderBy(desc(disputes.createdAt))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const results = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor =
    hasMore && results.length > 0
      ? results[results.length - 1]!.id
      : null;

  return c.json({
    ok: true,
    data: {
      disputes: results.map((d) => ({
        ...d,
        resolvedAt: d.resolvedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      nextCursor,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /disputes/:id — Dispute detail (agent auth + ownership check)
// ============================================================================

disputesRoutes.get("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const agent = c.get("agent")!;
  const disputeId = parseUuidParam(c.req.param("id"), "id");

  const [dispute] = await db
    .select({
      id: disputes.id,
      consensusId: disputes.consensusId,
      challengerAgentId: disputes.challengerAgentId,
      stakeAmount: disputes.stakeAmount,
      stakeCreditTransactionId: disputes.stakeCreditTransactionId,
      reasoning: disputes.reasoning,
      status: disputes.status,
      adminReviewerId: disputes.adminReviewerId,
      adminDecision: disputes.adminDecision,
      adminNotes: disputes.adminNotes,
      stakeReturned: disputes.stakeReturned,
      bonusPaid: disputes.bonusPaid,
      resolvedAt: disputes.resolvedAt,
      createdAt: disputes.createdAt,
    })
    .from(disputes)
    .where(eq(disputes.id, disputeId))
    .limit(1);

  if (!dispute) {
    throw new AppError("NOT_FOUND", "Dispute not found");
  }

  // Ownership check — agents can only view their own disputes
  if (dispute.challengerAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only view your own disputes");
  }

  return c.json({
    ok: true,
    data: {
      ...dispute,
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      createdAt: dispute.createdAt.toISOString(),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /disputes/admin/queue — Admin dispute queue (human auth + admin)
// ============================================================================

disputesRoutes.get("/admin/queue", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const query = parsed.data;

  const conditions = [
    inArray(disputes.status, ["open", "admin_review"]),
  ];

  if (query.cursor) {
    conditions.push(gt(disputes.id, query.cursor));
  }

  const rows = await db
    .select({
      id: disputes.id,
      consensusId: disputes.consensusId,
      challengerAgentId: disputes.challengerAgentId,
      stakeAmount: disputes.stakeAmount,
      reasoning: disputes.reasoning,
      status: disputes.status,
      createdAt: disputes.createdAt,
    })
    .from(disputes)
    .where(and(...conditions))
    .orderBy(desc(disputes.createdAt))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const results = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor =
    hasMore && results.length > 0
      ? results[results.length - 1]!.id
      : null;

  return c.json({
    ok: true,
    data: {
      disputes: results.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      })),
      nextCursor,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// POST /disputes/admin/:id/resolve — Admin resolve dispute (human auth + admin)
// ============================================================================

disputesRoutes.post(
  "/admin/:id/resolve",
  humanAuth(),
  requireAdmin(),
  async (c) => {
    const db = getDb();
    if (!db) {
      throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
    }

    const human = c.get("human");
    const disputeId = parseUuidParam(c.req.param("id"), "id");

    const body = await c.req.json();
    const parsed = resolveDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Invalid resolve input", {
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await resolveDispute(
      db,
      disputeId,
      parsed.data.verdict,
      parsed.data.adminNotes,
      human.id,
    );

    return c.json({
      ok: true,
      data: {
        ...result,
        resolvedAt: result.resolvedAt?.toISOString() ?? null,
      },
      requestId: c.get("requestId"),
    });
  },
);

export default disputesRoutes;
