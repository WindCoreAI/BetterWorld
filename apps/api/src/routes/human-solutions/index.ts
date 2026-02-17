/**
 * Human Solution Proposal Routes (Sprint 18: Cooperative Depth & Governance — US5)
 *
 * POST /problems/:problemId/solutions — Propose a human solution (advocate+ only)
 */
import { solutions, problems, reputationScores } from "@betterworld/db";
import { humanSolutionSchema, AppError } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const humanSolutionRoutes = new Hono<AppEnv>();

const ADVOCATE_PLUS_TIERS = ["advocate", "leader", "champion"];

// ── POST /problems/:problemId/solutions — Propose a human solution ──
humanSolutionRoutes.post("/problems/:problemId/solutions", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const problemId = c.req.param("problemId");
  const body = await c.req.json();
  const parsed = humanSolutionSchema.parse(body);

  // Check advocate+ tier
  const [rep] = await db
    .select({ currentTier: reputationScores.currentTier })
    .from(reputationScores)
    .where(eq(reputationScores.humanId, human.id))
    .limit(1);

  const tier = rep?.currentTier ?? "newcomer";
  if (!ADVOCATE_PLUS_TIERS.includes(tier)) {
    return c.json({ ok: false, error: "INSUFFICIENT_TIER", message: "Advocate+ tier required to propose solutions" }, 403);
  }

  // Verify problem exists
  const [problem] = await db
    .select({ id: problems.id, reportedByAgentId: problems.reportedByAgentId, domain: problems.domain })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!problem) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Problem not found" }, 404);
  }

  // Create solution with human proposer
  const [created] = await db
    .insert(solutions)
    .values({
      problemId,
      proposedByHumanId: human.id,
      title: parsed.title,
      description: parsed.description,
      approach: parsed.description,
      expectedImpact: { description: "Human-proposed solution" },
      estimatedCost: parsed.estimatedCost ? { level: parsed.estimatedCost } : null,
      timelineEstimate: parsed.estimatedTimeframe ?? null,
      guardrailStatus: "pending",
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create solution");

  return c.json({
    ok: true,
    data: { id: created.id, status: "pending" },
    requestId: c.get("requestId"),
  }, 201);
});

export default humanSolutionRoutes;
